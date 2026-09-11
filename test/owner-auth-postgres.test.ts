import { runMigrations } from '../packages/database/src/migrate.ts';
import { createHmac, randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDatabase } from '../packages/database/src/index.ts';
import { createOwnerAuth } from '../modules/tenancy/index.ts';

/**
 * PGlite runs one connection, so nothing in `modules/tenancy/test/owner.test.ts` can
 * actually race. These are the properties that only exist under real concurrency
 * (ADR-0017): a one-shot code must be one shot even when two requests arrive together,
 * and a fixed-window counter must not let ten simultaneous callers each read the same
 * count and all decide they are under the limit.
 */
const url = process.env['TALLA_TEST_DATABASE_URL'];
describe.skipIf(!url)('real PostgreSQL owner authentication', () => {
  const control = new Pool({ connectionString: url });
  const databaseName = `talla_${randomUUID().replaceAll('-', '')}_test`;
  const migrationUrl = new URL(url ?? 'postgresql://localhost/talla_test');
  migrationUrl.pathname = `/${databaseName}`;
  const migration = new Pool({ connectionString: migrationUrl.href });
  const applicationUrl = new URL(migrationUrl.href);
  applicationUrl.username = 'talla_app';
  const database = createDatabase({ connectionString: applicationUrl.href });

  const indexKey = new Uint8Array(32).fill(11);
  const phoneHash = (phone: string): string =>
    createHmac('sha256', indexKey).update(phone).digest('hex');

  const tenant = randomUUID();
  const owner = randomUUID();
  const phone = '+201000000123';
  const code = '424242';

  const auth = createOwnerAuth({
    database,
    secret: new Uint8Array(32).fill(13),
    phoneHash,
    createCode: () => code,
    sendCode: () => Promise.resolve(),
  });

  beforeAll(async () => {
    if (!new URL(url ?? '').pathname.endsWith('_test'))
      throw new Error('Integration tests require a database ending in _test');
    await control.query(`CREATE DATABASE "${databaseName}"`);
    await runMigrations(migration);
    await migration.query('ALTER ROLE talla_app LOGIN');
    await migration.query(
      "INSERT INTO tenants (id,subdomain,name_ar,name_en) VALUES ($1,'owner-concurrency','اختبار','Test')",
      [tenant],
    );
    await migration.query('INSERT INTO owners (id,phone_hash) VALUES ($1,$2)', [
      owner,
      phoneHash(phone),
    ]);
    await migration.query(
      "INSERT INTO owner_tenants (owner_id,tenant_id,role) VALUES ($1,$2,'owner')",
      [owner, tenant],
    );
  }, 60_000);

  afterAll(async () => {
    await database.close();
    await migration.end();
    await control.query(`DROP DATABASE IF EXISTS "${databaseName}"`);
    await control.end();
  });

  it('accepts a one-shot code exactly once under simultaneous verification', async () => {
    const started = await auth.startLogin(phone, '198.51.100.4');
    if (!started.ok) throw new Error(`startLogin failed: ${started.error}`);

    const results = await Promise.all(
      Array.from({ length: 8 }, () =>
        auth.completeLogin(started.value.challengeId, phone, code),
      ),
    );

    // FOR UPDATE serialises the readers; the losers find consumed_at already set.
    expect(results.filter((result) => result.ok)).toHaveLength(1);
    for (const result of results) {
      if (!result.ok) expect(result.error).toBe('AUTH_OTP_INVALID');
    }
    const { rows } = await migration.query<{ count: string }>(
      'SELECT count(*) AS count FROM sessions WHERE owner_id = $1',
      [owner],
    );
    expect(Number(rows[0]?.count)).toBe(1);
  }, 60_000);

  it('does not let simultaneous callers spend the same rate-limit allowance twice', async () => {
    const fresh = '+201000000124';
    // Ten at once against a limit of five per phone. An implementation that reads the
    // count and then writes it would let most of these through.
    const results = await Promise.all(
      Array.from({ length: 10 }, () => auth.startLogin(fresh, '198.51.100.5')),
    );

    expect(results.filter((result) => result.ok)).toHaveLength(5);
    for (const result of results) {
      if (!result.ok) expect(result.error).toBe('AUTH_OTP_RATE_LIMITED');
    }
  }, 60_000);

  it('reads nothing from a tenant table on a platform connection', async () => {
    await migration.query(
      "INSERT INTO garments (tenant_id,id,name_ar,name_en,price) VALUES ($1,$2,'قطعة','Piece',5000)",
      [tenant, randomUUID()],
    );

    // This is the property that makes `platform` safe rather than privileged: no tenant
    // is set, so the policy matches nothing, and the blast radius is the platform tables.
    const visible = await database.platform(async (sql) => {
      const { rows } = await sql.query<{ count: string }>(
        'SELECT count(*) AS count FROM garments',
      );
      return Number(rows[0]?.count);
    });

    expect(visible).toBe(0);
    const { rows } = await migration.query<{ count: string }>(
      'SELECT count(*) AS count FROM garments',
    );
    expect(Number(rows[0]?.count)).toBeGreaterThan(0);
  }, 60_000);
});
