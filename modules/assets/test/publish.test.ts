import { expect, it } from 'vitest';
import { publishBundle } from '../index.ts';
import type { PublishBundle } from '../index.ts';
const input: PublishBundle = {
  tenantId: 'store',
  pipelineVersion: '1.0.0',
  mannequinBytes: 100000,
  residentTextureBytes: 8 * 1024 * 1024,
  turntableFrames: 36,
  solveSeconds: 1,
  files: [
    { role: 'lod0', extension: 'glb', bytes: new Uint8Array(10000) },
    { role: 'lod1', extension: 'glb', bytes: new Uint8Array(5000) },
    { role: 'lod2', extension: 'glb', bytes: new Uint8Array(2000) },
    { role: 'textureA', extension: 'ktx2', bytes: new Uint8Array(10000) },
    { role: 'textureB', extension: 'ktx2', bytes: new Uint8Array(5000) },
    { role: 'turntable', extension: 'webp', bytes: new Uint8Array(10000) },
  ],
};
it('counts real bytes and does not write anything when over budget', async () => {
  const writes: string[] = [];
  const store = {
    putImmutable: (key: string): Promise<void> => {
      writes.push(key);
      return Promise.resolve();
    },
  };
  const oversize = {
    ...input,
    files: input.files.map((f) =>
      f.role === 'textureB' ? { ...f, bytes: new Uint8Array(500001) } : f,
    ),
  };
  await expect(publishBundle(oversize, store)).rejects.toThrow('ASSET_OVER_BUDGET');
  expect(writes).toEqual([]);
  const result = await publishBundle(input, store);
  expect(writes).toHaveLength(6);
  expect(result.bytesPublished).toBe(42000);
  expect(result.swapBytes).toBe(10000);
});
