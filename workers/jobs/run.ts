import { loadConfig } from '@talla/config';
import { createDatabase } from '@talla/database';
import { reveal } from '@talla/sensitive';
import { createLogger } from '@talla/observability';
import { createJobRunner } from './runner.ts';
import { createRetentionSweep } from './retention.ts';

/**
 * The job runner process.
 *
 * A loop, a sleep, and a clean shutdown. Everything that matters about correctness is in
 * the lease: if this process is killed mid-job the row's lease expires and another runner
 * takes it, so there is no in-memory state worth draining and no graceful handover to get
 * wrong. Shutdown finishes the pass it is in and stops.
 *
 * No stage handlers are registered yet. Ingest, understanding, solve and assets arrive in
 * Stage E, and until then a queued job backs off and dead-letters with `job.no_handler`
 * rather than spinning, which is a visible failure instead of a silent one.
 */

const IDLE_MS = 2000;
const BUSY_MS = 50;

/**
 * How often buyer contact details past their window are erased.
 *
 * Six hours rather than daily, so a process restarted every afternoon still sweeps, and
 * rather than hourly, because the window is measured in days and a tighter loop only adds
 * writes. The sweep runs once at startup too: a deployment that has been down for a week
 * should not wait another six hours to catch up.
 */
const RETENTION_INTERVAL_MS = 6 * 60 * 60 * 1000;

const config = loadConfig();
const logger = createLogger();
const database = createDatabase({ connectionString: reveal(config.databaseUrl) });
const runner = createJobRunner({ database, logger, handlers: {} });
const retention = createRetentionSweep({
  database,
  logger,
  retentionDays: config.retentionDays,
});

// A holder rather than a bare `let`: the flag is only ever cleared from a signal
// handler, which the control-flow analysis cannot see, and a plain boolean reads to the
// compiler as a loop that never ends.
const state = { running: true };
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    logger.info('jobs.stopping', { signal });
    state.running = false;
  });
}

logger.info('jobs.started', { retentionDays: config.retentionDays });
let sweptAt = 0;
try {
  while (state.running) {
    if (Date.now() - sweptAt >= RETENTION_INTERVAL_MS) {
      // Before the queue pass, not after: a busy queue must not be able to starve the
      // one piece of work that has a legal deadline attached to it.
      sweptAt = Date.now();
      await retention.runOnce();
    }

    const pass = await runner.runOnce();
    if (pass.claimed > 0) {
      logger.info('jobs.pass', {
        claimed: pass.claimed,
        completed: pass.completed,
        retried: pass.retried,
        deadLettered: pass.deadLettered,
      });
    }
    // Busy queues are polled tightly; an idle one is not worth the database round trips.
    await new Promise((resolve) =>
      setTimeout(resolve, pass.claimed > 0 ? BUSY_MS : IDLE_MS),
    );
  }
} finally {
  await database.close();
  logger.info('jobs.stopped', {});
}
