import { describe, expect, it } from 'vitest';
import type { GarmentSpec } from '@talla/garment-spec';
import fixture from '../../../packages/garment-spec/fixtures/valid-tee.json' with { type: 'json' };
import { rankSuggestions } from '../index.ts';

const anchor = fixture as unknown as GarmentSpec;
function candidate(id: string, edit: Partial<GarmentSpec['style']> = {}): GarmentSpec {
  return {
    ...structuredClone(anchor),
    id,
    style: { ...anchor.style, slot: 'bottom', ...edit },
  };
}

describe('styling rules', () => {
  it('enforces stock, tenant, selected size, slots, season and formality even for pins', () => {
    const valid = candidate('valid');
    const candidates = [
      valid,
      candidate('no-stock'),
      candidate('season', { season: 'cold' }),
      candidate('formal', { formality: 5 }),
      candidate('slot', { slot: 'top' }),
      { ...candidate('tenant'), tenant_id: 'other' },
    ];
    const result = rankSuggestions({
      anchor,
      candidates,
      pins: candidates.map((s) => ({ anchorId: anchor.id, suggestedId: s.id })),
      inStock: new Set(candidates.filter((s) => s.id !== 'no-stock').map((s) => s.id)),
      fillSlots: ['bottom', 'top'],
      selectedSize: 'M',
      stockBySize: new Map(candidates.map((s) => [s.id, new Map([['M', 1]])])),
    });
    expect(result.map((s) => s.garmentId)).toEqual(['valid']);
    expect(
      rankSuggestions({
        anchor,
        candidates: [valid],
        pins: [],
        inStock: new Set(['valid']),
        fillSlots: ['bottom'],
        selectedSize: 'XXL',
      }),
    ).toEqual([]);
  });
  it('does not confuse offered sizes with stock available in the selected size', () => {
    const valid = candidate('valid');
    expect(
      rankSuggestions({
        anchor,
        candidates: [valid],
        pins: [],
        inStock: new Set(['valid']),
        fillSlots: ['bottom'],
        selectedSize: 'M',
        stockBySize: new Map([
          [
            'valid',
            new Map([
              ['S', 2],
              ['M', 0],
            ]),
          ],
        ]),
      }),
    ).toEqual([]);
  });
  it('is deterministic, preserves input, deduplicates and puts eligible pins first', () => {
    const a = candidate('a');
    const b = candidate('b');
    const input = {
      anchor,
      candidates: [a, b, a],
      pins: [{ anchorId: anchor.id, suggestedId: 'b' }],
      inStock: new Set(['a', 'b']),
      fillSlots: ['bottom'] as const,
    };
    const before = structuredClone(input);
    expect(rankSuggestions(input).map((s) => s.garmentId)).toEqual(['b', 'a']);
    expect(rankSuggestions(input)).toEqual(rankSuggestions(input));
    expect(input).toEqual(before);
  });
  it('caps margin movement at one position across many deterministic catalogs', () => {
    for (let seed = 0; seed < 100; seed++) {
      const candidates = Array.from({ length: 6 }, (_, i) =>
        candidate(String(i), { pattern_busy: ((seed * 13 + i * 7) % 100) / 100 }),
      );
      const input = {
        anchor,
        candidates,
        pins: [],
        inStock: new Set(candidates.map((s) => s.id)),
        fillSlots: ['bottom'] as const,
      };
      const before = rankSuggestions(input);
      const after = rankSuggestions({
        ...input,
        merchandisingPriority: new Map(
          candidates.map((s, i) => [s.id, (seed * 17 + i * 31) % 101]),
        ),
      });
      after.forEach((s, i) => {
        const old = before.findIndex((v) => v.garmentId === s.garmentId);
        expect(Math.abs(old - i)).toBeLessThanOrEqual(1);
        expect(s.reason).toEqual(before[old]?.reason);
      });
    }
  });
});
