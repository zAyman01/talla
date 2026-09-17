import type { AssetPipeline } from '@talla/assets';
import type { Solver } from '@talla/solver';
import type { GarmentId, Result, TraceId } from '@talla/shared';

/**
 * Dress Solver plus Asset Pipeline. Trusted input only.
 *
 * Everything this worker reads has already crossed the ingest trust boundary, which is
 * why it may hold credentials the image worker may not.
 */

export interface SolveJob {
  readonly garmentId: GarmentId;
  readonly traceId: TraceId;
}

export interface GpuWorker {
  readonly solver: Solver;
  readonly assets: AssetPipeline;
  /** Idempotent: a job that runs twice publishes the same content-addressed assets. */
  run(job: SolveJob): Promise<Result<{ readonly published: true }, string>>;
}

export function createGpuWorker(options: {
  readonly solver: Solver;
  readonly assets: AssetPipeline;
}): GpuWorker {
  return {
    solver: options.solver,
    assets: options.assets,
    async run(job: SolveJob): Promise<Result<{ readonly published: true }, string>> {
      const mockBlock = {
        id: 'tee-crew-relaxed',
        version: '1.0.0',
        category: 'tee',
        meshSha256: 'mock-mesh-sha',
        uvLayoutSha256: 'mock-uv-sha',
      };
      const mockFabric = {
        id: 'cotton-jersey',
        bendStiffness: 0.12,
        stretchStiffness: 0.35,
        density: 0.18,
      };
      const mockSpec = {
        spec_version: '1.0.0',
        id: job.garmentId,
        tenant_id: 'tenant-1',
        category: 'tee',
        block_id: 'tee-crew-relaxed',
        block_version: '1.0.0',
        fabric: 'cotton-jersey',
        style: {
          slot: 'top' as const,
          dominant_colors: [{ hex: '#26356B', weight: 1, a: 10, b: -25 }],
          formality: 1,
          volume: 'relaxed',
          pattern_busy: 0,
          season: 'all',
        },
      } as unknown as Parameters<Solver['solve']>[0]['spec'];

      const solved = await options.solver.solve({
        spec: mockSpec,
        block: mockBlock,
        fabric: mockFabric,
        baseBody: 'M',
        morphBodies: ['XS', 'S', 'L', 'XL', 'XXL'],
      });

      if (!solved.ok) {
        return { ok: false, error: solved.error };
      }

      const published = await options.assets.publish(job.garmentId, solved.value);
      if (!published.ok) {
        return { ok: false, error: published.error };
      }

      return { ok: true, value: { published: true } };
    },
  };
}

