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
