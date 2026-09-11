import { runMigrations } from '@talla/database/migrate';
import { createHmac, randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { Database, Sql } from '@talla/database';
import { createOwnerAuth } from '../index.ts';
import type { OwnerAuth } from '../index.ts';

const db = new PGlite();

/**
 * PGlite in a bare transaction, which is what `platform` is: no `app.current_tenant`, and
 * row-level security therefore denying every tenant-scoped table.
 */
const database: Database = {
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
  tenant() {
    throw new Error('owner authentication must not open a tenant transaction');
  },
  close: () => Promise.resolve(),
};

const SECRET = new Uint8Array(32).fill(7);
const INDEX_KEY = new Uint8Array(32).fill(9);
const phoneHash = (phone: string): string =>
  createHmac('sha256', INDEX_KEY).update(phone).digest('hex');

const OWNER_PHONE = '+201000000001';
const STRANGER_PHONE = '+201000000002';
const CODE = '123456';

const tenantA = '11111111-1111-4111-8111-111111111111';
const tenantB = '22222222-2222-4222-8222-222222222222';
const tenantSuspended = '33333333-3333-4333-8333-333333333333';
const ownerId = '44444444-4444-4444-8444-444444444444';
const otherOwnerId = '55555555-5555-4555-8555-555555555555';

let sent: { phone: string; code: string }[] = [];
let clock = new Date('2026-09-11T09:00:00.000Z');
let auth: OwnerAuth;
let deliveryFails = false;

function build(): OwnerAuth {
  return createOwnerAuth({
    database,
    secret: SECRET,
    phoneHash,
    now: () => clock,
    createCode: () => CODE,
    sendCode: (phone, code) => {
      if (deliveryFails) return Promise.reject(new Error('carrier down'));
      sent.push({ phone, code });
      return Promise.resolve();
    },
  });
}

beforeAll(async () => {
  await runMigrations(db);
  await db.query(
    `INSERT INTO tenants (id, subdomain, name_ar, name_en, active) VALUES
       ($1,'store-a','أ','A',true),
       ($2,'store-b','ب','B',true),
       ($3,'store-c','ج','C',false)`,
    [tenantA, tenantB, tenantSuspended],
  );
  await db.query('INSERT INTO owners (id, phone_hash) VALUES ($1,$2),($3,$4)', [
    ownerId,
    phoneHash(OWNER_PHONE),
    otherOwnerId,
    phoneHash('+201000000003'),
  ]);
  await db.query(
    `INSERT INTO owner_tenants (owner_id, tenant_id, role, created_at) VALUES
       ($1,$2,'owner','2026-01-01'),($1,$3,'staff','2026-01-02'),($1,$4,'owner','2026-01-03')`,
    [ownerId, tenantA, tenantB, tenantSuspended],
  );
  // Run as the application role, so these tests exercise the grants in migration 003
  // rather than the migration role's unrestricted access.
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
  sent = [];
  deliveryFails = false;
  clock = new Date('2026-09-11T09:00:00.000Z');
  auth = build();
});

afterAll(async () => {
  await db.close();
});

async function signIn(): Promise<string> {
  const started = await auth.startLogin(OWNER_PHONE, '203.0.113.7');
  if (!started.ok) throw new Error(`startLogin failed: ${started.error}`);
  const done = await auth.completeLogin(started.value.challengeId, OWNER_PHONE, CODE);
  if (!done.ok) throw new Error(`completeLogin failed: ${done.error}`);
  return done.value.token;
}

describe('owner login', () => {
  it('signs a registered owner in and sends exactly one code', async () => {
    const token = await signIn();

    expect(sent).toEqual([{ phone: OWNER_PHONE, code: CODE }]);
    const resolved = await auth.resolveSession(token);
    expect(resolved.ok && resolved.value.ownerId).toBe(ownerId);
  });

  it('does not reveal whether a number is registered', async () => {
    const known = await auth.startLogin(OWNER_PHONE, '203.0.113.7');
    const unknown = await auth.startLogin(STRANGER_PHONE, '203.0.113.8');

    expect(known.ok).toBe(true);
    expect(unknown.ok).toBe(true);
    // Same shape of answer, and a challenge row either way.
    const { rows } = await db.query<{ count: number }>(
      'SELECT count(*)::int AS count FROM owner_challenges',
    );
    expect(rows[0]?.count).toBe(2);
    // But nothing was sent to a number that belongs to nobody.
    expect(sent.map((message) => message.phone)).toEqual([OWNER_PHONE]);
  });

  it('fails an unregistered number at verification the same way a wrong code fails', async () => {
    const started = await auth.startLogin(STRANGER_PHONE, '203.0.113.8');
    if (!started.ok) throw new Error('startLogin failed');

    const withRightCode = await auth.completeLogin(
      started.value.challengeId,
      STRANGER_PHONE,
      CODE,
    );
    expect(withRightCode).toEqual({ ok: false, error: 'AUTH_OTP_INVALID' });
  });

  it('refuses a wrong code and counts the attempt', async () => {
    const started = await auth.startLogin(OWNER_PHONE, '203.0.113.7');
    if (!started.ok) throw new Error('startLogin failed');

    expect(
      await auth.completeLogin(started.value.challengeId, OWNER_PHONE, '000000'),
    ).toEqual({ ok: false, error: 'AUTH_OTP_INVALID' });

    const { rows } = await db.query<{ attempts: number }>(
      'SELECT attempts FROM owner_challenges WHERE id = $1',
      [started.value.challengeId],
    );
    expect(rows[0]?.attempts).toBe(1);
  });

  it('locks a challenge after five wrong codes', async () => {
    const started = await auth.startLogin(OWNER_PHONE, '203.0.113.7');
    if (!started.ok) throw new Error('startLogin failed');
    for (let i = 0; i < 5; i += 1) {
      await auth.completeLogin(started.value.challengeId, OWNER_PHONE, '000000');
    }

    // Even the correct code now fails: the challenge is spent.
    expect(
      await auth.completeLogin(started.value.challengeId, OWNER_PHONE, CODE),
    ).toEqual({ ok: false, error: 'AUTH_OTP_INVALID' });
  });

  it('expires a code after five minutes', async () => {
    const started = await auth.startLogin(OWNER_PHONE, '203.0.113.7');
    if (!started.ok) throw new Error('startLogin failed');
    clock = new Date(clock.getTime() + 5 * 60 * 1000 + 1);

    expect(
      await auth.completeLogin(started.value.challengeId, OWNER_PHONE, CODE),
    ).toEqual({ ok: false, error: 'AUTH_OTP_INVALID' });
  });

  it('refuses to reuse a consumed challenge', async () => {
    const started = await auth.startLogin(OWNER_PHONE, '203.0.113.7');
    if (!started.ok) throw new Error('startLogin failed');
    await auth.completeLogin(started.value.challengeId, OWNER_PHONE, CODE);

    expect(
      await auth.completeLogin(started.value.challengeId, OWNER_PHONE, CODE),
    ).toEqual({ ok: false, error: 'AUTH_OTP_INVALID' });
  });

  it('rate limits OTP requests by phone across different addresses', async () => {
    for (let i = 0; i < 5; i += 1) {
      await auth.startLogin(OWNER_PHONE, `203.0.113.${String(i)}`);
    }

    expect(await auth.startLogin(OWNER_PHONE, '203.0.113.99')).toEqual({
      ok: false,
      error: 'AUTH_OTP_RATE_LIMITED',
    });
  });

  it('reports a delivery failure and does not leave a usable code behind', async () => {
    deliveryFails = true;
    const started = await auth.startLogin(OWNER_PHONE, '203.0.113.7');

    expect(started).toEqual({ ok: false, error: 'AUTH_OTP_DELIVERY_FAILED' });
    const { rows } = await db.query<{ consumed_at: Date | null }>(
      'SELECT consumed_at FROM owner_challenges',
    );
    expect(rows[0]?.consumed_at).not.toBeNull();
  });

  it('refuses a malformed phone number without touching the database', async () => {
    expect(await auth.startLogin('01000000001', '203.0.113.7')).toEqual({
      ok: false,
      error: 'AUTH_FORBIDDEN',
    });
    const { rows } = await db.query<{ count: number }>(
      'SELECT count(*)::int AS count FROM owner_challenges',
    );
    expect(rows[0]?.count).toBe(0);
  });
});

describe('sessions', () => {
  it('stores only a hash of the token', async () => {
    const token = await signIn();

    const { rows } = await db.query<{ token_hash: string }>(
      'SELECT token_hash FROM sessions',
    );
    // A leaked backup must not be a set of live credentials.
    expect(rows[0]?.token_hash).not.toBe(token);
    expect(rows[0]?.token_hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('rotates the session id on login and revokes the token the caller arrived with', async () => {
    const first = await signIn();
    const started = await auth.startLogin(OWNER_PHONE, '203.0.113.7');
    if (!started.ok) throw new Error('startLogin failed');
    const second = await auth.completeLogin(
      started.value.challengeId,
      OWNER_PHONE,
      CODE,
      first,
    );
    if (!second.ok) throw new Error('completeLogin failed');

    // Session fixation: a token handed to a victim before login must not survive it.
    expect(await auth.resolveSession(first)).toEqual({
      ok: false,
      error: 'AUTH_SESSION_EXPIRED',
    });
    expect((await auth.resolveSession(second.value.token)).ok).toBe(true);
    // The predecessor survives as a revoked row. Deleting it would break the chain the
    // successor points at, and destroy what a disputed access is settled from.
    const { rows } = await db.query<{
      id: string;
      rotated_from: string | null;
      revoked: boolean;
    }>('SELECT id, rotated_from, revoked_at IS NOT NULL AS revoked FROM sessions');

    expect(rows).toHaveLength(2);
    // Identified by the link, not by row order. Both rows are created at the same mocked
    // instant, so ordering by created_at decides nothing and falls through to a random
    // uuid, which is a coin flip dressed up as an assertion.
    const successor = rows.find((row) => row.rotated_from !== null);
    const predecessor = rows.find((row) => row.rotated_from === null);
    expect(predecessor?.revoked).toBe(true);
    expect(successor?.revoked).toBe(false);
    expect(successor?.rotated_from).toBe(predecessor?.id);
  });

  it('expires an idle session after thirty minutes', async () => {
    const token = await signIn();
    clock = new Date(clock.getTime() + 31 * 60 * 1000);

    expect(await auth.resolveSession(token)).toEqual({
      ok: false,
      error: 'AUTH_SESSION_EXPIRED',
    });
  });

  it('keeps a session alive while it is being used', async () => {
    const token = await signIn();
    for (let i = 0; i < 4; i += 1) {
      clock = new Date(clock.getTime() + 20 * 60 * 1000);
      expect((await auth.resolveSession(token)).ok, `resolve ${String(i)}`).toBe(true);
    }
  });

  it('expires a session at the absolute cap even while it is in use', async () => {
    const token = await signIn();
    // Kept warm past the twelve hour cap: idle timeout alone would never end it.
    for (let i = 0; i < 40; i += 1) {
      clock = new Date(clock.getTime() + 20 * 60 * 1000);
      await auth.resolveSession(token);
    }

    expect(await auth.resolveSession(token)).toEqual({
      ok: false,
      error: 'AUTH_SESSION_EXPIRED',
    });
  });

  it('refuses a session whose owner has been disabled', async () => {
    const token = await signIn();
    await db.exec('RESET ROLE');
    await db.query('UPDATE owners SET disabled_at = now() WHERE id = $1', [ownerId]);
    await db.exec('SET ROLE talla_app');
    try {
      expect(await auth.resolveSession(token)).toEqual({
        ok: false,
        error: 'AUTH_SESSION_EXPIRED',
      });
    } finally {
      await db.exec('RESET ROLE');
      await db.query('UPDATE owners SET disabled_at = NULL WHERE id = $1', [ownerId]);
      await db.exec('SET ROLE talla_app');
    }
  });

  it('ends a session on request', async () => {
    const token = await signIn();
    await auth.endSession(token);

    expect(await auth.resolveSession(token)).toEqual({
      ok: false,
      error: 'AUTH_SESSION_EXPIRED',
    });
  });

  it('refuses an unknown token', async () => {
    expect(await auth.resolveSession('not-a-real-token')).toEqual({
      ok: false,
      error: 'AUTH_SESSION_EXPIRED',
    });
  });
});

describe('tenant membership', () => {
  it('lists the active tenants an owner belongs to, and not the suspended one', async () => {
    const memberships = await auth.membershipsFor(ownerId);

    expect(memberships).toEqual([
      { tenantId: tenantA, role: 'owner' },
      { tenantId: tenantB, role: 'staff' },
    ]);
  });

  it('authorizes a tenant the owner belongs to', async () => {
    expect(await auth.authorizeTenant(ownerId, tenantA)).toEqual({
      ok: true,
      value: { tenantId: tenantA, role: 'owner' },
    });
  });

  it('refuses a tenant the owner does not belong to', async () => {
    // This is the check that makes a Host header unusable as a way to pick a tenant on
    // the admin origin, which serves every store from one name.
    expect(await auth.authorizeTenant(otherOwnerId, tenantA)).toEqual({
      ok: false,
      error: 'AUTH_FORBIDDEN',
    });
  });

  it('refuses a suspended tenant and a nonexistent one identically', async () => {
    const suspended = await auth.authorizeTenant(ownerId, tenantSuspended);
    const missing = await auth.authorizeTenant(ownerId, randomUUID());

    expect(suspended).toEqual({ ok: false, error: 'AUTH_FORBIDDEN' });
    expect(missing).toEqual(suspended);
  });
});
