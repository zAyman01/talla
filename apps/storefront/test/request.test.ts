import { runMigrations } from '@talla/database/migrate';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { tenantTransaction } from '@talla/database';
import type { Database, Sql } from '@talla/database';
import { createLogger } from '@talla/observability';
import { createTenantRequests } from '../server/request.ts';

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

const ROOT = 'talla.app';
const storeA = '11111111-1111-4111-8111-111111111111';
const storeB = '22222222-2222-4222-8222-222222222222';
const suspended = '33333333-3333-4333-8333-333333333333';

const lines: string[] = [];
// The 'throw' policy means any line carrying phone-shaped text fails the test rather
// than being quietly redacted. A hole upstream should break the build.
const logger = createLogger({ sink: (line) => lines.push(line), policy: 'throw' });
const requests = createTenantRequests({ database, rootDomain: ROOT, logger });

const namesVisible = async (host: string | null): Promise<string[] | 'refused'> => {
  const result = await requests.withTenant(host, 'trace-1', async (sql) => {
    const { rows } = await sql.query<{ name_en: string }>(
      'SELECT name_en FROM garments ORDER BY name_en',
    );
    return rows.map((row) => row.name_en);
  });
  return result.ok ? result.value : 'refused';
};

beforeAll(async () => {
  await runMigrations(db);
  await db.query(
    `INSERT INTO tenants (id, subdomain, name_ar, name_en, active) VALUES
       ($1,'store-a','أ','A',true),
       ($2,'store-b','ب','B',true),
       ($3,'store-c','ج','C',false)`,
    [storeA, storeB, suspended],
  );
  await db.query(
    `INSERT INTO garments (tenant_id, id, name_ar, name_en, price) VALUES
       ($1,$4,'قميص','A shirt',5000),
       ($2,$5,'بنطلون','B trousers',7000),
       ($3,$6,'فستان','C dress',9000)`,
    [storeA, storeB, suspended, randomUUID(), randomUUID(), randomUUID()],
  );
  await db.exec('SET ROLE talla_app');
}, 60_000);

afterAll(async () => {
  await db.close();
});

describe('withTenant', () => {
  it('reads the catalogue of the store the host names', async () => {
    expect(await namesVisible('store-a.talla.app')).toEqual(['A shirt']);
    expect(await namesVisible('store-b.talla.app')).toEqual(['B trousers']);
  });

  it('reads none of another tenant rows for a forged host', async () => {
    // The host decides the tenant, so this is the attack worth naming: ask for one store
    // and hope the query returns another. Row-level security answers, not a WHERE clause.
    const result = await requests.withTenant(
      'store-a.talla.app',
      'trace-1',
      async (sql) => {
        const { rows } = await sql.query<{ count: number }>(
          'SELECT count(*)::int AS count FROM garments WHERE tenant_id = $1',
          [storeB],
        );
        return rows[0]?.count ?? -1;
      },
    );

    expect(result).toEqual({ ok: true, value: 0 });
  });

  it('refuses a suspended store and an unknown one identically', async () => {
    // Distinguishing them tells an attacker which stores exist.
    expect(await namesVisible('store-c.talla.app')).toBe('refused');
    expect(await namesVisible('nobody.talla.app')).toBe('refused');
  });

  it('refuses a host that only looks like a child of the parent domain', async () => {
    for (const host of [
      'store-a.talla.app.attacker.example',
      'store-a.talla.app.evil',
      'talla.app',
      'store-a.other.app',
      'deep.store-a.talla.app',
    ]) {
      expect(await namesVisible(host), host).toBe('refused');
    }
  });

  it('refuses a missing host rather than falling back to a default tenant', async () => {
    expect(await namesVisible(null)).toBe('refused');
    expect(await namesVisible('')).toBe('refused');
  });

  it('logs one line per request carrying the trace id, tenant and duration', async () => {
    lines.length = 0;
    await namesVisible('store-a.talla.app');

    const record = JSON.parse(lines.at(-1) ?? '{}') as Record<string, unknown>;
    expect(record['event']).toBe('tenant.request');
    expect(record['traceId']).toBe('trace-1');
    expect(record['tenantId']).toBe(storeA);
    expect(record['outcome']).toBe('ok');
    expect(typeof record['durationMs']).toBe('number');
  });

  it('carries the trace id into the work', async () => {
    const result = await requests.withTenant(
      'store-a.talla.app',
      'trace-abc',
      (_sql, context) => Promise.resolve(context),
    );

    expect(result.ok && result.value).toEqual({
      tenantId: storeA,
      subdomain: 'store-a',
      traceId: 'trace-abc',
    });
  });

  it('rolls the transaction back when the work throws', async () => {
    await expect(
      requests.withTenant('store-a.talla.app', 'trace-1', async (sql) => {
        await sql.query("UPDATE garments SET price = 1 WHERE name_en = 'A shirt'");
        throw new Error('work failed');
      }),
    ).rejects.toThrow('work failed');

    const after = await requests.withTenant(
      'store-a.talla.app',
      'trace-1',
      async (sql) => {
        const { rows } = await sql.query<{ price: number }>('SELECT price FROM garments');
        return rows[0]?.price;
      },
    );
    expect(after).toEqual({ ok: true, value: 5000 });
  });
});
