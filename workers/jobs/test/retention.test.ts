import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import { createPrivacyBox, tenantTransaction } from '@talla/database';
import { runMigrations } from '@talla/database/migrate';
import type { Database, Sql } from '@talla/database';
import { createLogger } from '@talla/observability';
import { conceal } from '@talla/sensitive';
import { createRetentionSweep } from '../retention.ts';

/**
 * The retention sweep, against a real schema.
 *
 * What is worth proving is not that `applyRetention` erases a row, which its own tests
 * cover. It is that the sweep reaches every active tenant, that it leaves a record even
 * where it erased nothing, and that one tenant failing does not stop the rest: the stores
 * it would skip are precisely the ones still holding contact details past their window.
 */

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

const first = '11111111-1111-4111-8111-111111111111';
const second = '22222222-2222-4222-8222-222222222222';
const suspended = '33333333-3333-4333-8333-333333333333';

const privacy = createPrivacyBox(new Uint8Array(32).fill(5), new Uint8Array(32).fill(6));
const lines: string[] = [];
const logger = createLogger({ sink: (line) => lines.push(line), policy: 'throw' });

const BUYER_PHONE = '+201000000031';
const BUYER_ADDRESS = '9 شارع قصر النيل، وسط البلد، القاهرة';
const RETENTION_DAYS = 90;
const now = new Date();

/** An order that settled `daysAgo` days before the sweep runs. */
async function order(tenantId: string, daysAgo: number): Promise<string> {
  const id = randomUUID();
  // Seeded through a tenant transaction, because the application role writes under the
  // policy like everything else does.
  await db.query("SELECT set_config('app.current_tenant', $1, false)", [tenantId]);
  const fulfilled = new Date(now.getTime() - daysAgo * 24 * 60 * 60 * 1000);
  const sealed = privacy.sealBuyer(
    {
      name: conceal('ليلى'),
      phone: conceal(BUYER_PHONE),
      address: conceal(BUYER_ADDRESS),
    },
    tenantId,
  );
  await db.query(
    `INSERT INTO orders
       (tenant_id, id, idempotency_key, request_hash, reference, total, status, cohort,
        buyer_ciphertext, buyer_phone_hash, fulfilled_at)
     VALUES ($1, $2, $3, $4, $5, 65000, 'fulfilled', 'viewer', $6, $7, $8)`,
    [
      tenantId,
      id,
      randomUUID(),
      id,
      `TAL-${id.slice(0, 6).toUpperCase()}`,
      sealed.ciphertext,
      sealed.phoneHash,
      fulfilled.toISOString(),
    ],
  );
  return id;
}

beforeAll(async () => {
  await runMigrations(db);
  await db.query(
    `INSERT INTO tenants (id, subdomain, name_ar, name_en, active) VALUES
       ($1,'first','الأول','First',true),
       ($2,'second','الثاني','Second',true),
       ($3,'closed','مغلق','Closed',false)`,
    [first, second, suspended],
  );
  // Everything after this runs as the application role, which is the whole point.
  // `applyRetention` carries no tenant_id in its WHERE clause: the row-level security
  // policy is what scopes it. Run as a superuser it erases every store's buyers at once,
  // which is how the first draft of this test passed while proving the opposite.
  await db.exec('SET ROLE talla_app');
}, 60_000);

beforeEach(async () => {
  // Cleanup runs as the migration role. TRUNCATE, not DELETE, because the audit log
  // carries an immutability trigger that refuses a row deletion, which is the trigger
  // doing its job.
  await db.exec('RESET ROLE');
  await db.exec('TRUNCATE audit_log, order_lines, orders');
  await db.exec('SET ROLE talla_app');
  lines.length = 0;
});

afterAll(async () => {
  await db.close();
});

it('erases past the window, leaves the window alone, and records every tenant', async () => {
  const stale = await order(first, RETENTION_DAYS + 5);
  const recent = await order(first, RETENTION_DAYS - 5);
  // The second store has orders, none of them old enough. It must still be recorded.
  await order(second, 1);

  const sweep = createRetentionSweep({
    database,
    logger,
    retentionDays: RETENTION_DAYS,
    now: () => now,
  });
  expect(await sweep.runOnce()).toEqual({ tenants: 2, erased: 1 });

  await tenantTransaction(db, first, async (sql) => {
    const { rows } = await sql.query<{ id: string; buyer_ciphertext: string | null }>(
      'SELECT id, buyer_ciphertext FROM orders ORDER BY fulfilled_at',
    );
    const erased = rows.find((row) => row.id === stale);
    const kept = rows.find((row) => row.id === recent);
    expect(erased?.buyer_ciphertext).toBeNull();
    expect(kept?.buyer_ciphertext).not.toBeNull();
  });

  // The proof it ran, in both stores, including the one where it found nothing. Without
  // this row a store with no expired orders is indistinguishable from a sweep that never
  // reached it (spec 12.7).
  for (const [tenantId, erasedCount] of [
    [first, 1],
    [second, 0],
  ] as const) {
    await tenantTransaction(db, tenantId, async (sql) => {
      const { rows } = await sql.query<{
        action: string;
        entity_id: string;
        details: { erased: number; windowDays: number };
      }>(
        "SELECT action, entity_id, details FROM audit_log WHERE action = 'retention.swept'",
      );
      expect(rows).toHaveLength(1);
      expect(rows[0]?.entity_id).toBe(now.toISOString().slice(0, 10));
      expect(rows[0]?.details).toEqual({
        erased: erasedCount,
        windowDays: RETENTION_DAYS,
      });
    });
  }
});

it('skips a suspended store, which has not consented to anything being touched', async () => {
  await order(suspended, RETENTION_DAYS + 30);

  const sweep = createRetentionSweep({
    database,
    logger,
    retentionDays: RETENTION_DAYS,
    now: () => now,
  });
  expect(await sweep.runOnce()).toEqual({ tenants: 2, erased: 0 });

  await tenantTransaction(db, suspended, async (sql) => {
    const { rows } = await sql.query<{ buyer_ciphertext: string | null }>(
      'SELECT buyer_ciphertext FROM orders',
    );
    expect(rows[0]?.buyer_ciphertext).not.toBeNull();
  });
});

it('carries on when one tenant fails, and never logs what it erased', async () => {
  await order(first, RETENTION_DAYS + 5);
  await order(second, RETENTION_DAYS + 5);

  // A database that refuses the first tenant and accepts the second.
  let calls = 0;
  const flaky: Database = {
    ...database,
    tenant(tenantId, work) {
      calls += 1;
      if (tenantId === first) return Promise.reject(new Error('connection reset'));
      return database.tenant(tenantId, work);
    },
  };

  const sweep = createRetentionSweep({
    database: flaky,
    logger,
    retentionDays: RETENTION_DAYS,
    now: () => now,
  });
  expect(await sweep.runOnce()).toEqual({ tenants: 2, erased: 1 });
  expect(calls).toBeGreaterThan(1);

  const output = lines.join('\n');
  expect(output).toContain('retention.tenant_failed');
  expect(output).toContain('retention.swept');
  // The logger throws on a leak under the test policy, so this is belt and braces: the
  // failure path is the one where a driver error carries a row into a log line.
  expect(output).not.toContain(BUYER_PHONE);
  expect(output).not.toContain('قصر النيل');
  expect(output).not.toContain('connection reset');
});
