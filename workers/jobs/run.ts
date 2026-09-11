import { loadConfig } from '@talla/config';
import { createDatabase } from '@talla/database';
import { reveal } from '@talla/sensitive';
import { createLogger } from '@talla/observability';
import { createJobRunner } from './runner.ts';

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

const config = loadConfig();
const logger = createLogger();
const database = createDatabase({ connectionString: reveal(config.databaseUrl) });
const runner = createJobRunner({ database, logger, handlers: {} });

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

logger.info('jobs.started', {});
try {
  while (state.running) {
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
