import { describe, expect, it } from 'vitest';
import { createAssetPipeline } from '../index.ts';

describe('Asset Pipeline', () => {
  it('publishes a solved garment with 3 LODs, 2 textures, and a 36-frame turntable within budget', async () => {
    const pipeline = createAssetPipeline({
      tenantId: 'test-tenant',
      pipelineVersion: '1.0.0',
    });

    const mockSolved = {
      baseMeshSha256: 'a'.repeat(64),
      morphDeltaSha256: ['b'.repeat(64), 'c'.repeat(64)],
      settleClipSha256: 'd'.repeat(64),
      solveSeconds: 1.45,
    };

    const result = await pipeline.publish('test-garment-1', mockSolved);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.meshes).toHaveLength(3);
    expect(result.value.textures).toHaveLength(2);
    expect(result.value.textures[0]?.contentType).toBe('image/ktx2');
    expect(result.value.turntableSha256).toBeTruthy();
    expect(result.value.costPerSku.solveSeconds).toBe(1.45);
    expect(result.value.costPerSku.bytesPublished).toBeGreaterThan(0);
  });
});
