import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { renderTypes } from '../src/render-types.ts';
import { generatedTypesPath } from '../src/paths.ts';

/**
 * Spec section 7, enforcement point 1: a field cannot drift because nobody hand-writes
 * the type. Committing generated output makes a hand-edit possible, so this is the
 * check that makes it fail (ADR-0016).
 */
describe('generated GarmentSpec types', () => {
  it('match what the schema produces right now', async () => {
    const [committed, current] = await Promise.all([
      readFile(generatedTypesPath, 'utf8'),
      renderTypes(),
    ]);
    expect(
      committed,
      'Generated types are stale or hand-edited. Run: pnpm --filter @talla/garment-spec generate',
    ).toBe(current);
  });
});
