import { expect, it } from 'vitest';
import { assetKey, checkAssetBudget } from '../index.ts';
const valid = { firstGarmentBytes: 1_200_000, swapBytes: 500_000, residentTextureBytes: 256 * 1024 * 1024,
  turntableFrames: 36, lods: [0, 1, 2], gpuTextureTypes: ['image/ktx2'] };
it('accepts the boundary and rejects oversize, invalid values, and incomplete fallbacks', () => {
  expect(checkAssetBudget(valid).ok).toBe(true);
  for (const firstGarmentBytes of [1_200_001, NaN, -1, Infinity, 1.5]) expect(checkAssetBudget({ ...valid, firstGarmentBytes }).ok).toBe(false);
  expect(checkAssetBudget({ ...valid, swapBytes: 500_001 }).ok).toBe(false);
  expect(checkAssetBudget({ ...valid, gpuTextureTypes: ['image/png'] }).ok).toBe(false);
  expect(checkAssetBudget({ ...valid, turntableFrames: 35 }).ok).toBe(false);
});
it('names immutable assets and rejects path traversal', () => {
  expect(assetKey('store', '1.0.0', 'a'.repeat(64), 'glb')).toBe(`store/1.0.0/${'a'.repeat(64)}.glb`);
  expect(() => assetKey('../store', '1.0.0', 'a'.repeat(64), 'glb')).toThrow();
});
