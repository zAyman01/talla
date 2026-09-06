import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { tenantTransaction } from '../src/index.ts';

const a = '11111111-1111-4111-8111-111111111111';
const b = '22222222-2222-4222-8222-222222222222';
const garment = '33333333-3333-4333-8333-333333333333';
const db = new PGlite();
beforeAll(async () => {
  await db.exec(await readFile(new URL('../migrations/001-initial.sql', import.meta.url), 'utf8'));
  await db.query("INSERT INTO tenants (id,subdomain,name_ar,name_en) VALUES ($1,'store-a','أ','A'),($2,'store-b','ب','B')", [a,b]);
  await db.query("INSERT INTO garments (tenant_id,id,name_ar,name_en,price) VALUES ($1,$3,'أ','A',100),($2,$3,'ب','B',200)", [a,b,garment]);
  await db.exec('SET ROLE talla_app');
}, 30000);
afterAll(async () => { await db.close(); });

it('enumerates all tenant tables and requires RLS, FORCE RLS and policies', async () => {
  const { rows } = await db.query<{ tablename: string; relrowsecurity: boolean; relforcerowsecurity: boolean; policies: number }>(`
    SELECT c.relname AS tablename,c.relrowsecurity,c.relforcerowsecurity,
      (SELECT count(*)::int FROM pg_policy p WHERE p.polrelid=c.oid) AS policies
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relkind='r' AND EXISTS
      (SELECT 1 FROM pg_attribute a WHERE a.attrelid=c.oid AND a.attname='tenant_id')`);
  expect(rows.length).toBe(7);
  for (const row of rows) {
    expect(row.relrowsecurity, row.tablename).toBe(true);
    expect(row.relforcerowsecurity, row.tablename).toBe(true);
    expect(row.policies, row.tablename).toBeGreaterThan(0);
  }
});
it('denies reads without a tenant and cross-tenant reads even without WHERE', async () => {
  expect((await db.query('SELECT * FROM garments')).rows).toEqual([]);
  await tenantTransaction(db, a, async (sql) => {
    const rows = (await sql.query('SELECT * FROM garments')).rows;
    expect(rows).toHaveLength(1);
    expect(rows[0]?.['tenant_id']).toBe(a);
    expect((await sql.query('SELECT * FROM garments WHERE tenant_id=$1', [b])).rows).toEqual([]);
  });
  expect((await db.query('SELECT * FROM garments')).rows).toEqual([]);
});
it('denies cross-tenant writes and rolls back the entire transaction', async () => {
  await expect(tenantTransaction(db, a, async (sql) => {
    await sql.query('UPDATE garments SET price=999');
    await sql.query("INSERT INTO stock (tenant_id,garment_id,size,quantity) VALUES ($1,$2,'M',1)", [b,garment]);
  })).rejects.toThrow();
  await tenantTransaction(db, a, async (sql) => {
    expect((await sql.query('SELECT price FROM garments')).rows[0]?.['price']).toBe(100);
  });
});
it('does not permit audit log rewriting', async () => {
  await expect(tenantTransaction(db,a,async(sql) => { await sql.query("UPDATE audit_log SET action='hidden'"); })).rejects.toThrow();
});
