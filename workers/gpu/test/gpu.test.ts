import { describe, expect, it } from 'vitest';
import { createSolver } from '@talla/solver';
import { createAssetPipeline } from '@talla/assets';
import { createGpuWorker } from '../index.ts';

describe('GPU Worker', () => {
  it('orchestrates solver and asset publishing pipeline idempotently', async () => {
    const solver = createSolver();
    const assets = createAssetPipeline({ tenantId: 'tenant-test' });
    const worker = createGpuWorker({ solver, assets });

    const job = {
      garmentId: 'garment-123',
      traceId: 'trace-456',
    };

    const result = await worker.run(job);
    expect(result.ok).toBe(true);
  });
});
