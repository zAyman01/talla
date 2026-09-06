import { expect, it } from 'vitest';
import type { GarmentSpec } from '@talla/garment-spec';
import fixture from '../../../packages/garment-spec/fixtures/valid-tee.json' with { type: 'json' };
import { confirmFields, preserveConfirmations } from '../index.ts';

it('retains store changes and their confidence across model reruns', () => {
  const previous = confirmFields(fixture as unknown as GarmentSpec, [
    'attributes.neckline',
    'style',
  ]);
  const next = structuredClone(previous);
  next.fabric = 'linen';
  next.attributes.neckline = 'v';
  next.style.formality = 5;
  next.confidence['attributes.neckline'] = 0.1;
  const result = preserveConfirmations(next, previous);
  expect(result.fabric).toBe(previous.fabric);
  expect(result.attributes.neckline).toBe(previous.attributes.neckline);
  expect(result.style).toEqual(previous.style);
  expect(result.confidence['attributes.neckline']).toBe(0.94);
  expect(next.attributes.neckline).toBe('v');
});
it('rejects cross-tenant provenance and prototype paths', () => {
  const spec = fixture as unknown as GarmentSpec;
  expect(() => preserveConfirmations({ ...spec, tenant_id: 'other' }, spec)).toThrow(
    'identity',
  );
  expect(() => confirmFields(spec, ['__proto__.polluted'])).toThrow('Unsupported');
});
