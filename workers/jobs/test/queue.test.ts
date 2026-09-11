import { runMigrations } from '@talla/database/migrate';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { tenantTransaction } from '@talla/database';
import type { Database, Sql } from '@talla/database';
import { createLogger } from '@talla/observability';
import { codedError } from '@talla/errors';
import { backoffMs, claimJob, completeJob, enqueueJob, failJob } from '../queue.ts';
import { createJobRunner } from '../runner.ts';
import type { JobHandler } from '../index.ts';

const db = new PGlite();
const tenantA = '11111111-1111-4111-8111-111111111111';
const tenantB = '22222222-2222-4222-8222-222222222222';
const suspended = '33333333-3333-4333-8333-333333333333';
const garmentA = '44444444-4444-4444-8444-444444444444';
const garmentB = '55555555-5555-4555-8555-555555555555';
const garmentC = '66666666-6666-4666-8666-666666666666';

const database: Database = {
  tenant: (tenantId, work) => tenantTransaction(db, tenantId, work),
  async platform<T>(work: (sql: Sql) => Promise<T>): Promise<T> {
    await db.query('BEGIN');
    try {
      const result = await work(db);
      await db.query('COMMIT');
      return result;
    } catch (error) {
      await db.query('ROLLBACK');
      throw error;
    }
  },
  close: () => db.close(),
};

let lines: string[] = [];
const logger = createLogger({ sink: (line) => lines.push(line), policy: 'throw' });
let clock = new Date('2026-09-11T09:00:00.000Z');

beforeAll(async () => {
  await runMigrations(db);
  await db.query(
    `INSERT INTO tenants (id, subdomain, name_ar, name_en, active) VALUES
       ($1,'jobs-a','أ','A',true),($2,'jobs-b','ب','B',true),($3,'jobs-c','ج','C',false)`,
    [tenantA, tenantB, suspended],
  );
  await db.query(
    `INSERT INTO garments (tenant_id, id, name_ar, name_en, price) VALUES
       ($1,$4,'أ','A',1000),($2,$5,'ب','B',1000),($3,$6,'ج','C',1000)`,
    [tenantA, tenantB, suspended, garmentA, garmentB, garmentC],
  );
  await db.exec('SET ROLE talla_app');
}, 60_000);

beforeEach(async () => {
  await tenantTransaction(db, tenantA, async (sql) => {
    await sql.query('DELETE FROM jobs');
  });
  await tenantTransaction(db, tenantB, async (sql) => {
    await sql.query('DELETE FROM jobs');
  });
  lines = [];
  clock = new Date('2026-09-11T09:00:00.000Z');
});

afterAll(async () => {
  await db.close();
});

async function queue(tenantId: string, garmentId: string): Promise<string> {
  const jobId = randomUUID();
  await tenantTransaction(db, tenantId, (sql) =>
    enqueueJob(sql, {
      tenantId,
      jobId,
      garmentId,
      stage: 'ingest',
      traceId: randomUUID(),
      availableAt: clock,
    }),
  );
  return jobId;
}

async function jobRow(
  tenantId: string,
  jobId: string,
): Promise<Record<string, unknown> | undefined> {
  return tenantTransaction(db, tenantId, async (sql) => {
    const { rows } = await sql.query('SELECT * FROM jobs WHERE id = $1', [jobId]);
    return rows[0];
  });
}

describe('claimJob', () => {
  it('takes a queued job and marks it running with a lease', async () => {
    const jobId = await queue(tenantA, garmentA);

    const claimed = await tenantTransaction(db, tenantA, (sql) => claimJob(sql, clock));

    expect(claimed?.id).toBe(jobId);
    expect(claimed?.attempts).toBe(1);
    const row = await jobRow(tenantA, jobId);
    expect(row?.['status']).toBe('running');
    expect(row?.['lease_until']).not.toBeNull();
  });

  it('returns nothing when the queue is empty', async () => {
    expect(
      await tenantTransaction(db, tenantA, (sql) => claimJob(sql, clock)),
    ).toBeUndefined();
  });

  it('does not take a job whose retry time has not arrived', async () => {
    const jobId = await queue(tenantA, garmentA);
    await tenantTransaction(db, tenantA, async (sql) => {
      await sql.query('UPDATE jobs SET available_at = $2 WHERE id = $1', [
        jobId,
        new Date(clock.getTime() + 60_000),
      ]);
    });

    expect(
      await tenantTransaction(db, tenantA, (sql) => claimJob(sql, clock)),
    ).toBeUndefined();
  });

  it('reclaims a job whose lease expired, which is how a crashed runner recovers', async () => {
    const jobId = await queue(tenantA, garmentA);
    await tenantTransaction(db, tenantA, (sql) => claimJob(sql, clock, 1000));

    // Without the lease, this row would claim to be running forever and nothing would
    // ever pick it up again.
    const later = new Date(clock.getTime() + 2000);
    const reclaimed = await tenantTransaction(db, tenantA, (sql) => claimJob(sql, later));

    expect(reclaimed?.id).toBe(jobId);
    expect(reclaimed?.attempts).toBe(2);
  });

  it('does not reclaim a job whose lease is still held', async () => {
    await queue(tenantA, garmentA);
    await tenantTransaction(db, tenantA, (sql) => claimJob(sql, clock, 60_000));

    const soon = new Date(clock.getTime() + 1000);
    expect(
      await tenantTransaction(db, tenantA, (sql) => claimJob(sql, soon)),
    ).toBeUndefined();
  });

  it('cannot see another tenant queue', async () => {
    await queue(tenantB, garmentB);

    // Row-level security, not a WHERE clause. This is also why the runner polls per
    // tenant instead of draining one global queue.
    expect(
      await tenantTransaction(db, tenantA, (sql) => claimJob(sql, clock)),
    ).toBeUndefined();
    expect(
      await tenantTransaction(db, tenantB, (sql) => claimJob(sql, clock)),
    ).toBeDefined();
  });
});

describe('failJob', () => {
  it('requeues with backoff and records the taxonomy code', async () => {
    const jobId = await queue(tenantA, garmentA);
    const job = await tenantTransaction(db, tenantA, (sql) => claimJob(sql, clock));
    if (!job) throw new Error('expected a job');

    const outcome = await tenantTransaction(db, tenantA, (sql) =>
      failJob(sql, job, codedError('INGEST_TOO_DARK'), clock, 5),
    );

    expect(outcome.status).toBe('queued');
    expect(outcome.code).toBe('INGEST_TOO_DARK');
    const row = await jobRow(tenantA, jobId);
    expect(row?.['status']).toBe('queued');
    expect(row?.['error_code']).toBe('INGEST_TOO_DARK');
    expect(new Date(row?.['available_at'] as string).getTime()).toBeGreaterThan(
      clock.getTime(),
    );
  });

  it('dead-letters once the attempts are spent instead of looping forever', async () => {
    const jobId = await queue(tenantA, garmentA);
    const job = await tenantTransaction(db, tenantA, (sql) => claimJob(sql, clock));
    if (!job) throw new Error('expected a job');

    const outcome = await tenantTransaction(db, tenantA, (sql) =>
      failJob(sql, { ...job, attempts: 5 }, new Error('still broken'), clock, 5),
    );

    expect(outcome.status).toBe('failed');
    // An unrecognised throw is internal: it has no copy a store owner should read.
    expect(outcome.code).toBe('INTERNAL_ERROR');
    const row = await jobRow(tenantA, jobId);
    expect(row?.['status']).toBe('failed');
    expect(row?.['lease_until']).toBeNull();
  });

  it('backs off exponentially and then stops growing', () => {
    expect(backoffMs(1)).toBe(10_000);
    expect(backoffMs(2)).toBe(20_000);
    expect(backoffMs(3)).toBe(40_000);
    // Capped, so one broken garment cannot hold a slot open indefinitely.
    expect(backoffMs(20)).toBe(15 * 60 * 1000);
    expect(backoffMs(0)).toBe(10_000);
  });
});

describe('the runner', () => {
  const handlers = (handler: JobHandler): Record<'ingest', JobHandler> => ({
    ingest: handler,
  });

  it('drains every active tenant in one pass and skips the suspended one', async () => {
    await queue(tenantA, garmentA);
    await queue(tenantB, garmentB);
    await tenantTransaction(db, suspended, (sql) =>
      enqueueJob(sql, {
        tenantId: suspended,
        jobId: randomUUID(),
        garmentId: garmentC,
        stage: 'ingest',
        traceId: randomUUID(),
        availableAt: clock,
      }),
    );

    const seen: string[] = [];
    const runner = createJobRunner({
      database,
      logger,
      now: () => clock,
      handlers: handlers((job) => {
        seen.push(job.tenantId);
        return Promise.resolve();
      }),
    });

    expect(await runner.runOnce()).toEqual({
      claimed: 2,
      completed: 2,
      retried: 0,
      deadLettered: 0,
    });
    expect(seen.sort()).toEqual([tenantA, tenantB].sort());
  });

  it('rolls the handler writes back on failure and still records the failure', async () => {
    const jobId = await queue(tenantA, garmentA);
    const runner = createJobRunner({
      database,
      logger,
      now: () => clock,
      maxAttempts: 5,
      handlers: handlers(async (job, sql) => {
        // A write the handler makes before failing must not survive.
        await sql.query("UPDATE garments SET status = 'ready' WHERE id = $1", [
          job.garmentId,
        ]);
        throw codedError('INGEST_BLURRY');
      }),
    });

    expect(await runner.runOnce()).toMatchObject({
      claimed: 1,
      retried: 1,
      completed: 0,
    });

    const row = await jobRow(tenantA, jobId);
    expect(row?.['status']).toBe('queued');
    expect(row?.['error_code']).toBe('INGEST_BLURRY');
    const garment = await tenantTransaction(db, tenantA, async (sql) => {
      const { rows } = await sql.query<{ status: string }>(
        'SELECT status FROM garments WHERE id = $1',
        [garmentA],
      );
      return rows[0]?.status;
    });
    // The failure record committed; the handler's write did not.
    expect(garment).toBe('draft');
  });

  it('dead-letters a job that keeps failing rather than retrying it forever', async () => {
    const jobId = await queue(tenantA, garmentA);
    const runner = createJobRunner({
      database,
      logger,
      now: () => clock,
      maxAttempts: 3,
      handlers: handlers(() => Promise.reject(codedError('INGEST_INVALID_FILE'))),
    });

    for (let pass = 0; pass < 4; pass += 1) {
      await runner.runOnce();
      // Move past the backoff so the next pass can claim it again.
      clock = new Date(clock.getTime() + 30 * 60 * 1000);
    }

    const row = await jobRow(tenantA, jobId);
    expect(row?.['status']).toBe('failed');
    expect(row?.['error_code']).toBe('INGEST_INVALID_FILE');
  });

  it('backs a stage with no handler off instead of spinning on it', async () => {
    await tenantTransaction(db, tenantA, (sql) =>
      enqueueJob(sql, {
        tenantId: tenantA,
        jobId: randomUUID(),
        garmentId: garmentA,
        stage: 'solve',
        traceId: randomUUID(),
        availableAt: clock,
      }),
    );
    const runner = createJobRunner({
      database,
      logger,
      now: () => clock,
      handlers: handlers(() => Promise.resolve()),
    });

    expect(await runner.runOnce()).toMatchObject({ claimed: 1, retried: 1 });
    expect(lines.some((line) => line.includes('job.no_handler'))).toBe(true);
  });

  it('completes a job and clears its lease', async () => {
    const jobId = await queue(tenantA, garmentA);
    await tenantTransaction(db, tenantA, async (sql) => {
      const job = await claimJob(sql, clock);
      if (job) await completeJob(sql, job.id);
    });

    const row = await jobRow(tenantA, jobId);
    expect(row?.['status']).toBe('done');
    expect(row?.['lease_until']).toBeNull();
  });

  it('logs the trace id the job was enqueued with', async () => {
    await queue(tenantA, garmentA);
    const runner = createJobRunner({
      database,
      logger,
      now: () => clock,
      handlers: handlers(() => Promise.resolve()),
    });
    await runner.runOnce();

    const completed = lines
      .map((line) => JSON.parse(line) as Record<string, unknown>)
      .find((record) => record['event'] === 'job.completed');
    expect(completed?.['traceId']).toMatch(/^[0-9a-f-]{36}$/);
    expect(completed?.['tenantId']).toBe(tenantA);
  });
});
