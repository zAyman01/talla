import { runMigrations } from '@talla/database/migrate';
import { createHmac, randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { tenantTransaction } from '@talla/database';
import type { Database, Sql } from '@talla/database';
import { createLogger } from '@talla/observability';
import { createOwnerAuth } from '@talla/tenancy';
import { createAdminRequests, recordAudit } from '../server/request.ts';

const db = new PGlite();
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

const indexKey = new Uint8Array(32).fill(4);
const phoneHash = (phone: string): string =>
  createHmac('sha256', indexKey).update(phone).digest('hex');

const OWNER_PHONE = '+201000000001';
const OTHER_PHONE = '+201000000002';
const CODE = '123456';

const mine = '11111111-1111-4111-8111-111111111111';
const theirs = '22222222-2222-4222-8222-222222222222';
const ownerId = '44444444-4444-4444-8444-444444444444';
const otherOwnerId = '55555555-5555-4555-8555-555555555555';
const garment = '66666666-6666-4666-8666-666666666666';

let clock = new Date('2026-09-11T09:00:00.000Z');
const logger = createLogger({ sink: () => undefined, policy: 'throw' });

const auth = createOwnerAuth({
  database,
  secret: new Uint8Array(32).fill(6),
  phoneHash,
  now: () => clock,
  createCode: () => CODE,
  sendCode: () => Promise.resolve(),
});
const requests = createAdminRequests({ database, auth, logger });

async function signIn(phone: string): Promise<string> {
  const started = await auth.startLogin(phone, '203.0.113.9');
  if (!started.ok) throw new Error(`startLogin failed: ${started.error}`);
  const done = await auth.completeLogin(started.value.challengeId, phone, CODE);
  if (!done.ok) throw new Error(`completeLogin failed: ${done.error}`);
  return done.value.token;
}

beforeAll(async () => {
  await runMigrations(db);
  await db.query(
    `INSERT INTO tenants (id, subdomain, name_ar, name_en) VALUES
       ($1,'mine','لي','Mine'),($2,'theirs','لهم','Theirs')`,
    [mine, theirs],
  );
  await db.query('INSERT INTO owners (id, phone_hash) VALUES ($1,$2),($3,$4)', [
    ownerId,
    phoneHash(OWNER_PHONE),
    otherOwnerId,
    phoneHash(OTHER_PHONE),
  ]);
  await db.query(
    "INSERT INTO owner_tenants (owner_id, tenant_id, role) VALUES ($1,$2,'owner'),($3,$4,'owner')",
    [ownerId, mine, otherOwnerId, theirs],
  );
  await db.query(
    "INSERT INTO garments (tenant_id,id,name_ar,name_en,price) VALUES ($1,$2,'قطعة','Piece',5000)",
    [mine, garment],
  );
  await db.exec('SET ROLE talla_app');
}, 60_000);

beforeEach(async () => {
  // Cleanup runs as the migration role: `owner_challenges` deliberately grants the
  // application SELECT, INSERT and UPDATE but not DELETE, because a challenge is consumed
  // rather than removed and retention sweeps it later.
  await db.exec('RESET ROLE');
  await db.exec(
    'DELETE FROM sessions; DELETE FROM owner_challenges; DELETE FROM rate_limits',
  );
  await db.exec('SET ROLE talla_app');
  clock = new Date('2026-09-11T09:00:00.000Z');
});

afterAll(async () => {
  await db.close();
});

describe('withOwnerTenant', () => {
  it('opens a tenant transaction for a store the owner belongs to', async () => {
    const token = await signIn(OWNER_PHONE);

    const result = await requests.withOwnerTenant(token, mine, 'trace-1', async (sql) => {
      const { rows } = await sql.query<{ count: number }>(
        'SELECT count(*)::int AS count FROM garments',
      );
      return rows[0]?.count;
    });

    expect(result).toEqual({ ok: true, value: 1 });
  });

  it('refuses a store the owner does not belong to', async () => {
    const token = await signIn(OWNER_PHONE);

    // The confused deputy. Admin serves every store from one origin, so this is the only
    // thing standing between a signed-in owner and another store's data.
    expect(
      await requests.withOwnerTenant(token, theirs, 'trace-1', () =>
        Promise.resolve('read'),
      ),
    ).toEqual({ ok: false, error: 'AUTH_FORBIDDEN' });
  });

  it('refuses a store that does not exist the same way', async () => {
    const token = await signIn(OWNER_PHONE);

    // Distinguishing them would tell a signed-in owner which stores are on Talla.
    expect(
      await requests.withOwnerTenant(token, randomUUID(), 'trace-1', () =>
        Promise.resolve('read'),
      ),
    ).toEqual({ ok: false, error: 'AUTH_FORBIDDEN' });
  });

  it('refuses a malformed tenant id without opening anything', async () => {
    const token = await signIn(OWNER_PHONE);

    expect(
      await requests.withOwnerTenant(token, 'not-a-uuid', 'trace-1', () =>
        Promise.resolve('read'),
      ),
    ).toEqual({ ok: false, error: 'AUTH_FORBIDDEN' });
  });

  it('refuses a missing, unknown or expired session before it looks at the tenant', async () => {
    for (const token of [undefined, '', 'forged-token']) {
      expect(
        await requests.withOwnerTenant(token, mine, 'trace-1', () =>
          Promise.resolve('read'),
        ),
        String(token),
      ).toEqual({ ok: false, error: 'AUTH_SESSION_EXPIRED' });
    }

    const token = await signIn(OWNER_PHONE);
    clock = new Date(clock.getTime() + 31 * 60 * 1000);
    expect(
      await requests.withOwnerTenant(token, mine, 'trace-1', () =>
        Promise.resolve('read'),
      ),
    ).toEqual({ ok: false, error: 'AUTH_SESSION_EXPIRED' });
  });

  it('carries the owner, role and trace into the work', async () => {
    const token = await signIn(OWNER_PHONE);

    const result = await requests.withOwnerTenant(
      token,
      mine,
      'trace-xyz',
      (_sql, context) => Promise.resolve(context),
    );

    expect(result.ok && result.value).toEqual({
      tenantId: mine,
      ownerId,
      role: 'owner',
      traceId: 'trace-xyz',
    });
  });

  it('reads none of another tenant rows even inside an authorized transaction', async () => {
    const token = await signIn(OWNER_PHONE);

    const result = await requests.withOwnerTenant(token, mine, 'trace-1', async (sql) => {
      const { rows } = await sql.query<{ count: number }>(
        'SELECT count(*)::int AS count FROM garments WHERE tenant_id = $1',
        [theirs],
      );
      return rows[0]?.count;
    });

    // Membership decides which tenant you become; row-level security decides what that
    // means. Both, not either.
    expect(result).toEqual({ ok: true, value: 0 });
  });
});

describe('withOwner', () => {
  it('resolves a session without needing a store chosen yet', async () => {
    const token = await signIn(OWNER_PHONE);

    const result = await requests.withOwner(token, 'trace-1', (session) =>
      Promise.resolve(session.ownerId),
    );

    expect(result).toEqual({ ok: true, value: ownerId });
  });
});

describe('recordAudit', () => {
  it('writes a row an owner cannot later rewrite', async () => {
    const token = await signIn(OWNER_PHONE);

    await requests.withOwnerTenant(token, mine, 'trace-1', async (sql, context) => {
      await recordAudit(sql, context, 'garment.confirmed', garment, { fields: 2 });
    });

    const rows = await tenantTransaction(db, mine, async (sql) => {
      const { rows } = await sql.query<{ actor_id: string; action: string }>(
        'SELECT actor_id, action FROM audit_log',
      );
      return rows;
    });
    expect(rows).toEqual([{ actor_id: ownerId, action: 'garment.confirmed' }]);

    // The append-only trigger from 001-initial.sql, exercised for the first time.
    await expect(
      tenantTransaction(db, mine, async (sql) => {
        await sql.query("UPDATE audit_log SET action = 'something else'");
      }),
    ).rejects.toThrow();
  });
});
