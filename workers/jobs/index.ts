/**
 * The job runner: drains the PostgreSQL-backed queue in `jobs`.
 *
 * Published interface only. Spec 6 puts long work behind a durable queue because a solve
 * runs for minutes and must survive a deploy, and a Postgres-backed queue is sufficient
 * at this size (ADR-0001).
 */
export { createJobRunner } from './runner.ts';
export type { JobHandler, JobRunner, JobRunnerOptions, PassResult } from './runner.ts';
export {
  DEFAULT_LEASE_MS,
  DEFAULT_MAX_ATTEMPTS,
  backoffMs,
  claimJob,
  completeJob,
  enqueueJob,
  failJob,
  renewLease,
} from './queue.ts';
export type { FailureOutcome, JobStage, JobStatus, LeasedJob } from './queue.ts';
export { createRetentionSweep } from './retention.ts';
export type { RetentionSweep, RetentionSweepOptions, SweepResult } from './retention.ts';
