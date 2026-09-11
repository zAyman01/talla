import type { Sql } from '@talla/database';
import { errorCodeOf } from '@talla/errors';
import type { ErrorCode } from '@talla/errors';

/**
 * Claiming, completing and failing a job. One tenant transaction at a time.
 *
 * The `jobs` table has carried leases and an attempt count since `001-initial.sql` and
 * nothing has ever read it. This is the reader.
 *
 * **Why a runner cannot poll globally.** `jobs` is tenant-scoped with forced row-level
 * security, so a connection with no `app.current_tenant` set sees zero rows. That is the
 * isolation working, not a problem to route around: the alternative is a role that
 * bypasses RLS, which would make every policy in the schema decorative. So the loop asks
 * the platform which tenants are active, then opens one tenant transaction each.
 *
 * The cost is one poll per tenant per cycle. At three pilot stores that is three cheap
 * queries. **The trigger to revisit** is the tenant count making the idle poll loop
 * expensive, and the fix then is a platform-level "this tenant has work" table maintained
 * by a trigger, not a wider-privileged connection.
 */

export type JobStage = 'ingest' | 'understanding' | 'solve' | 'assets';
export type JobStatus = 'queued' | 'running' | 'done' | 'failed';

export interface LeasedJob {
  readonly id: string;
  readonly tenantId: string;
  readonly garmentId: string;
  readonly stage: JobStage;
  readonly attempts: number;
  readonly traceId: string;
}

interface JobRow extends Record<string, unknown> {
  readonly id: string;
  readonly tenant_id: string;
  readonly garment_id: string;
  readonly stage: JobStage;
  readonly attempts: number;
  readonly trace_id: string;
}

/** Long enough for a solve, short enough that a crashed runner is retried in one cycle. */
export const DEFAULT_LEASE_MS = 5 * 60 * 1000;
export const DEFAULT_MAX_ATTEMPTS = 5;
const BACKOFF_BASE_MS = 10 * 1000;
const BACKOFF_CAP_MS = 15 * 60 * 1000;

/**
 * Exponential, capped. A failing stage that retries every ten seconds forever is a way to
 * turn one broken garment into a busy queue nothing else gets through.
 */
export function backoffMs(attempts: number): number {
  return Math.min(BACKOFF_BASE_MS * 2 ** Math.max(0, attempts - 1), BACKOFF_CAP_MS);
}

/**
 * Take the next runnable job, or nothing.
 *
 * `FOR UPDATE SKIP LOCKED` is what makes two runners safe: the second skips the row the
 * first is holding rather than blocking on it, so they share the queue instead of
 * serialising on its head.
 *
 * A `running` row whose lease has expired is claimable again. That is the crashed-runner
 * path, and it is the reason the lease exists rather than a simple status flag: a process
 * that dies mid-job leaves the row claiming to be running, and nothing would ever pick it
 * up again.
 */
export async function claimJob(
  sql: Sql,
  now: Date,
  leaseMs: number = DEFAULT_LEASE_MS,
): Promise<LeasedJob | undefined> {
  const { rows } = await sql.query<JobRow>(
    `UPDATE jobs SET
       status = 'running',
       attempts = attempts + 1,
       lease_until = $2
     WHERE id = (
       SELECT id FROM jobs
       WHERE (status = 'queued' AND available_at <= $1)
          OR (status = 'running' AND lease_until IS NOT NULL AND lease_until <= $1)
       ORDER BY available_at
       FOR UPDATE SKIP LOCKED
       LIMIT 1
     )
     RETURNING id, tenant_id, garment_id, stage, attempts, trace_id`,
    [now, new Date(now.getTime() + leaseMs)],
  );

  const row = rows[0];
  return row === undefined
    ? undefined
    : {
        id: row.id,
        tenantId: row.tenant_id,
        garmentId: row.garment_id,
        stage: row.stage,
        attempts: row.attempts,
        traceId: row.trace_id,
      };
}

/** Extend a lease on a job still making progress, so a long solve is not stolen. */
export async function renewLease(
  sql: Sql,
  jobId: string,
  now: Date,
  leaseMs: number = DEFAULT_LEASE_MS,
): Promise<void> {
  await sql.query(
    "UPDATE jobs SET lease_until = $2 WHERE id = $1 AND status = 'running'",
    [jobId, new Date(now.getTime() + leaseMs)],
  );
}

export async function completeJob(sql: Sql, jobId: string): Promise<void> {
  await sql.query(
    "UPDATE jobs SET status = 'done', lease_until = NULL, error_code = NULL WHERE id = $1",
    [jobId],
  );
}

export interface FailureOutcome {
  readonly status: Extract<JobStatus, 'queued' | 'failed'>;
  readonly code: ErrorCode;
  readonly retryAt?: Date;
}

/**
 * Record a failure: retry with backoff, or dead-letter once the attempts are spent.
 *
 * The taxonomy code goes in `error_code`, which is what the column was always for. A
 * dead-lettered job stops rather than looping, because a queue that retries a permanently
 * broken garment forever is a queue that stops delivering the working ones.
 */
export async function failJob(
  sql: Sql,
  job: LeasedJob,
  thrown: unknown,
  now: Date,
  maxAttempts: number = DEFAULT_MAX_ATTEMPTS,
): Promise<FailureOutcome> {
  const code = errorCodeOf(thrown);

  if (job.attempts >= maxAttempts) {
    await sql.query(
      "UPDATE jobs SET status = 'failed', lease_until = NULL, error_code = $2 WHERE id = $1",
      [job.id, code],
    );
    return { status: 'failed', code };
  }

  const retryAt = new Date(now.getTime() + backoffMs(job.attempts));
  await sql.query(
    "UPDATE jobs SET status = 'queued', lease_until = NULL, available_at = $2, error_code = $3 WHERE id = $1",
    [job.id, retryAt, code],
  );
  return { status: 'queued', code, retryAt };
}

/**
 * Enqueue a stage for a garment. Called by admin on upload.
 *
 * `availableAt` is explicit rather than defaulting to the column's `now()`. Every other
 * time in this file comes from the caller's clock, and mixing the two means a queue whose
 * readiness depends on the database's wall clock agreeing with the application's, which
 * is exactly the kind of difference that only shows up in a test or an outage.
 */
export async function enqueueJob(
  sql: Sql,
  input: {
    readonly tenantId: string;
    readonly jobId: string;
    readonly garmentId: string;
    readonly stage: JobStage;
    readonly traceId: string;
    readonly availableAt: Date;
  },
): Promise<void> {
  await sql.query(
    `INSERT INTO jobs (tenant_id, id, garment_id, stage, trace_id, available_at)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      input.tenantId,
      input.jobId,
      input.garmentId,
      input.stage,
      input.traceId,
      input.availableAt,
    ],
  );
}
