import { applyRetention } from '@talla/commerce';
import type { Database } from '@talla/database';
import type { Logger } from '@talla/observability';

/**
 * The retention sweep.
 *
 * `applyRetention` has existed and had no caller since the privacy work landed, which
 * made the retention policy a function somebody could run rather than something that
 * happens. A policy nothing executes is a policy discovered during an audit, and spec
 * 12.7 puts defining the window before the first pilot, not after.
 *
 * It runs in the jobs process rather than on the queue. A queued job needs something to
 * enqueue it, and a sweep that only runs when a job exists is a sweep that stops the
 * first time the enqueuer is misconfigured. This runs on a clock, in the one process that
 * is always up for exactly this kind of work.
 *
 * **Every sweep is recorded, including the ones that erase nothing.** `applyRetention`
 * writes an audit row per erased order, so a tenant with no orders past the window leaves
 * no trace at all, and "it has not run since March" becomes unanswerable at the moment
 * somebody needs the answer.
 */

export interface RetentionSweepOptions {
  readonly database: Database;
  readonly logger: Logger;
  /** `TALLA_RETENTION_DAYS`. Days after fulfilment or cancellation. */
  readonly retentionDays: number;
  readonly now?: () => Date;
}

export interface SweepResult {
  readonly tenants: number;
  readonly erased: number;
}

export interface RetentionSweep {
  /** One pass across every active tenant. Returns what it did, so a test can assert it. */
  runOnce(): Promise<SweepResult>;
}

interface TenantRow extends Record<string, unknown> {
  readonly id: string;
}

export function createRetentionSweep(options: RetentionSweepOptions): RetentionSweep {
  const now = options.now ?? ((): Date => new Date());

  return {
    async runOnce(): Promise<SweepResult> {
      const { rows } = await options.database.platform((sql) =>
        sql.query<TenantRow>('SELECT id FROM tenants WHERE active ORDER BY created_at'),
      );

      let erased = 0;
      for (const tenant of rows) {
        // One tenant's failure is not the rest of the estate's. A suspended database or
        // a policy change that breaks one store must not stop the sweep for every other,
        // because the ones it skips are the ones holding PII past their window.
        try {
          const count = await applyRetention(
            options.database,
            tenant.id,
            options.retentionDays,
          );
          erased += count;
          await record(options, tenant.id, count, now());
        } catch (error) {
          // The class of failure, never its message. An exception message is the most
          // common way a buyer's address reaches a log line (spec 16.5).
          options.logger.error('retention.tenant_failed', {
            tenantId: tenant.id,
            errorName: error instanceof Error ? error.name : 'unknown',
          });
        }
      }

      options.logger.info('retention.swept', {
        tenants: rows.length,
        erased,
        windowDays: options.retentionDays,
      });
      return { tenants: rows.length, erased };
    },
  };
}

/** The proof the sweep happened, in the append-only log that already exists. */
async function record(
  options: RetentionSweepOptions,
  tenantId: string,
  erased: number,
  at: Date,
): Promise<void> {
  await options.database.tenant(tenantId, (sql) =>
    sql.query(
      `INSERT INTO audit_log (tenant_id, actor_id, action, entity_id, details)
       VALUES ($1, 'retention', 'retention.swept', $2, $3)`,
      [
        tenantId,
        // The day, not the instant, so a reader scanning the log sees one row per sweep
        // rather than a timestamp they have to compare against a schedule.
        at.toISOString().slice(0, 10),
        JSON.stringify({ erased, windowDays: options.retentionDays }),
      ],
    ),
  );
}
