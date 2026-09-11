import type { Database, Sql } from '@talla/database';
import type { Logger } from '@talla/observability';
import {
  DEFAULT_LEASE_MS,
  DEFAULT_MAX_ATTEMPTS,
  claimJob,
  completeJob,
  failJob,
} from './queue.ts';
import type { JobStage, LeasedJob } from './queue.ts';

/**
 * The loop that drains the queue.
 *
 * One pass asks the platform which tenants are active, then opens a tenant transaction
 * per tenant and takes at most one job from each. `jobs` is tenant-scoped with forced
 * row-level security, so there is no global queue to drain: a connection with no tenant
 * set sees nothing, which is the isolation working rather than an obstacle.
 *
 * **Three transactions per job, and the split is load bearing.**
 *
 * 1. Claim, committed on its own, because the attempt counter and the lease have to
 *    survive whatever the handler does next.
 * 2. Handler and completion together, so a garment is never marked done by a pass whose
 *    writes rolled back.
 * 3. The failure record, if there is one.
 *
 * A first version ran the claim and the handler in one transaction. A failing handler
 * then rolled back its own claim, so `attempts` never rose above one in the database and
 * the job retried forever: the dead-letter path was unreachable, which is exactly what it
 * exists to prevent. The test caught it, and this shape is the fix.
 *
 * If the process dies between 1 and 2, the lease expires and the job is reclaimed. That
 * is what the lease is for.
 */

export type JobHandler = (job: LeasedJob, sql: Sql) => Promise<void>;

export interface JobRunnerOptions {
  readonly database: Database;
  readonly logger: Logger;
  readonly handlers: Readonly<Partial<Record<JobStage, JobHandler>>>;
  readonly leaseMs?: number;
  readonly maxAttempts?: number;
  readonly now?: () => Date;
}

export interface PassResult {
  readonly claimed: number;
  readonly completed: number;
  readonly retried: number;
  readonly deadLettered: number;
}

interface TenantRow extends Record<string, unknown> {
  readonly id: string;
}

export interface JobRunner {
  /** One sweep across every active tenant. Returns what it did, so a test can assert it. */
  runOnce(): Promise<PassResult>;
}

type Mutable<T> = { -readonly [K in keyof T]: T[K] };

export function createJobRunner(options: JobRunnerOptions): JobRunner {
  const now = options.now ?? ((): Date => new Date());
  const leaseMs = options.leaseMs ?? DEFAULT_LEASE_MS;
  const maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;

  async function activeTenants(): Promise<readonly string[]> {
    return options.database.platform(async (sql) => {
      const { rows } = await sql.query<TenantRow>(
        'SELECT id FROM tenants WHERE active ORDER BY created_at',
      );
      return rows.map((row) => row.id);
    });
  }

  async function recordFailure(
    job: LeasedJob,
    thrown: unknown,
    tally: Mutable<PassResult>,
  ): Promise<void> {
    const outcome = await options.database.tenant(job.tenantId, (sql) =>
      failJob(sql, job, thrown, now(), maxAttempts),
    );
    tally[outcome.status === 'failed' ? 'deadLettered' : 'retried'] += 1;
    options.logger
      .child({ traceId: job.traceId, tenantId: job.tenantId, jobId: job.id })
      .error(outcome.status === 'failed' ? 'job.dead_lettered' : 'job.retrying', {
        stage: job.stage,
        attempt: job.attempts,
        code: outcome.code,
        retryAt: outcome.retryAt?.toISOString(),
      });
  }

  async function drainTenant(
    tenantId: string,
    tally: Mutable<PassResult>,
  ): Promise<void> {
    const job = await options.database.tenant(tenantId, (sql) =>
      claimJob(sql, now(), leaseMs),
    );
    if (job === undefined) return;
    tally.claimed += 1;

    const logger = options.logger.child({
      traceId: job.traceId,
      tenantId: job.tenantId,
      jobId: job.id,
      stage: job.stage,
    });
    const handler = options.handlers[job.stage];

    if (handler === undefined) {
      // A stage with no handler is a deployment mistake, not a garment problem. It still
      // goes through the failure path so it backs off instead of spinning.
      logger.error('job.no_handler', { attempt: job.attempts });
      await recordFailure(job, new Error(`No handler for stage ${job.stage}`), tally);
      return;
    }

    try {
      await options.database.tenant(tenantId, async (sql) => {
        await handler(job, sql);
        await completeJob(sql, job.id);
      });
      tally.completed += 1;
      logger.info('job.completed', { attempt: job.attempts });
    } catch (thrown) {
      // The handler's writes rolled back with that transaction. The claim did not: it was
      // committed before the handler ran, so this attempt still counts against the cap.
      await recordFailure(job, thrown, tally);
    }
  }

  return {
    async runOnce() {
      const tally: Mutable<PassResult> = {
        claimed: 0,
        completed: 0,
        retried: 0,
        deadLettered: 0,
      };

      for (const tenantId of await activeTenants()) {
        try {
          await drainTenant(tenantId, tally);
        } catch (thrown) {
          // Not the handler: the claim itself, or the database. Log and move to the next
          // tenant rather than letting one store's outage stop every other store's queue.
          options.logger.error('job.tenant_pass_failed', {
            tenantId,
            errorName: thrown instanceof Error ? thrown.name : 'unknown',
          });
        }
      }
      return tally;
    },
  };
}
