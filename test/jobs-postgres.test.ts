import { runMigrations } from '../packages/database/src/migrate.ts';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDatabase } from '../packages/database/src/index.ts';
import { createLogger } from '../packages/observability/src/index.ts';
import { createJobRunner } from '../workers/jobs/index.ts';
import { enqueueJob } from '../workers/jobs/queue.ts';

/**
 * PGlite runs one connection, so two runners cannot actually race there. `FOR UPDATE SKIP
 * LOCKED` is the whole basis of running more than one worker, and this is the only place
 * it is genuinely exercised (ADR-0017).
 */
const url = process.env['TALLA_TEST_DATABASE_URL'];
describe.skipIf(!url)('real PostgreSQL job queue', () => {
  const control = new Pool({ connectionString: url });
  const databaseName = `talla_${randomUUID().replaceAll('-', '')}_test`;
  const migrationUrl = new URL(url ?? 'postgresql://localhost/talla_test');
  migrationUrl.pathname = `/${databaseName}`;
  const migration = new Pool({ connectionString: migrationUrl.href });
  const applicationUrl = new URL(migrationUrl.href);
  applicationUrl.username = 'talla_app';
  const database = createDatabase({ connectionString: applicationUrl.href });
  const logger = createLogger({ sink: () => undefined, policy: 'throw' });

  const tenant = randomUUID();
  const garment = randomUUID();

  beforeAll(async () => {
    if (!new URL(url ?? '').pathname.endsWith('_test'))
      throw new Error('Integration tests require a database ending in _test');
    await control.query(`CREATE DATABASE "${databaseName}"`);
    await runMigrations(migration);
    await migration.query('ALTER ROLE talla_app LOGIN');
    await migration.query(
      "INSERT INTO tenants (id,subdomain,name_ar,name_en) VALUES ($1,'jobs-concurrency','اختبار','Test')",
      [tenant],
    );
    await migration.query(
      "INSERT INTO garments (tenant_id,id,name_ar,name_en,price) VALUES ($1,$2,'قطعة','Piece',5000)",
      [tenant, garment],
    );
  }, 60_000);

  afterAll(async () => {
    await database.close();
    await migration.end();
    await control.query(`DROP DATABASE IF EXISTS "${databaseName}"`);
    await control.end();
  });

  it('hands one job to exactly one runner when several sweep at once', async () => {
    const jobIds = Array.from({ length: 6 }, () => randomUUID());
    await database.tenant(tenant, async (sql) => {
      for (const jobId of jobIds) {
        await enqueueJob(sql, {
          tenantId: tenant,
          jobId,
          garmentId: garment,
          stage: 'ingest',
          traceId: randomUUID(),
          availableAt: new Date(),
        });
      }
    });

    const handled: string[] = [];
    const runners = Array.from({ length: 4 }, () =>
      createJobRunner({
        database,
        logger,
        handlers: {
          ingest: (job) => {
            handled.push(job.id);
            return Promise.resolve();
          },
        },
      }),
    );

    // Each runner takes one job per tenant per sweep, so six sweeps of four runners is
    // more than enough capacity and plenty of opportunity to collide.
    for (let round = 0; round < 6; round += 1) {
      await Promise.all(runners.map((runner) => runner.runOnce()));
    }

    // No job handled twice: SKIP LOCKED means the second runner steps over the row the
    // first is holding rather than waiting for it and then taking it as well.
    expect(new Set(handled).size).toBe(handled.length);
    expect(new Set(handled)).toEqual(new Set(jobIds));

    const { rows } = await migration.query<{ status: string; count: string }>(
      'SELECT status, count(*) AS count FROM jobs GROUP BY status',
    );
    expect(rows).toEqual([{ status: 'done', count: '6' }]);
  }, 120_000);

  it('lets a second runner reclaim a job whose holder died', async () => {
    const jobId = randomUUID();
    await database.tenant(tenant, (sql) =>
      enqueueJob(sql, {
        tenantId: tenant,
        jobId,
        garmentId: garment,
        stage: 'ingest',
        traceId: randomUUID(),
        availableAt: new Date(),
      }),
    );

    // A runner that claims with a lease of nothing is a runner that died the instant
    // after claiming.
    const crashed = createJobRunner({
      database,
      logger,
      leaseMs: 0,
      handlers: {
        ingest: () => Promise.reject(new Error('process died')),
      },
    });
    await crashed.runOnce().catch(() => undefined);
    await migration.query(
      "UPDATE jobs SET status = 'running', lease_until = now() - interval '1 minute' WHERE id = $1",
      [jobId],
    );

    const healthy = createJobRunner({
      database,
      logger,
      handlers: { ingest: () => Promise.resolve() },
    });
    const result = await healthy.runOnce();

    expect(result.claimed).toBe(1);
    expect(result.completed).toBe(1);
  }, 120_000);
});
