import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDatabase, createPrivacyBox } from '../packages/database/src/index.ts';
import { createCheckout } from '../modules/commerce/index.ts';

// A dedicated disposable database only. CI provisions it as a PostgreSQL service.
const url = process.env['TALLA_TEST_DATABASE_URL'];
describe.skipIf(!url)('real PostgreSQL concurrency', () => {
  const control = new Pool({ connectionString: url });
  const databaseName = `talla_${randomUUID().replaceAll('-', '')}_test`;
  const migrationUrl = new URL(url ?? 'postgresql://localhost/talla_test');
  migrationUrl.pathname = `/${databaseName}`;
  const migration = new Pool({ connectionString: migrationUrl.href });
  const applicationUrl = new URL(url ?? 'postgresql://localhost/talla_test');
  applicationUrl.pathname = `/${databaseName}`;
  applicationUrl.username = 'talla_app';
  const database = createDatabase({ connectionString: applicationUrl.href });
  const privacy = createPrivacyBox(
    new Uint8Array(32).fill(3),
    new Uint8Array(32).fill(4),
  );
  const checkout = createCheckout({
    database,
    verifyPhone: () => Promise.resolve(true),
    sealBuyer: privacy.seal,
    phoneHash: privacy.phoneHash,
  });
  const tenant = randomUUID();
  const garment = randomUUID();
  beforeAll(async () => {
    if (!new URL(url ?? '').pathname.endsWith('_test'))
      throw new Error('Integration tests require a database ending in _test');
    await control.query(`CREATE DATABASE "${databaseName}"`);
    await migration.query(
      await readFile(
        new URL('../packages/database/migrations/001-initial.sql', import.meta.url),
        'utf8',
      ),
    );
    await migration.query('ALTER ROLE talla_app LOGIN');
    await migration.query(
      "INSERT INTO tenants(id,subdomain,name_ar,name_en) VALUES($1,'concurrency-test','اختبار','Test')",
      [tenant],
    );
    await migration.query(
      "INSERT INTO garments(tenant_id,id,name_ar,name_en,price,status) VALUES($1,$2,'قطعة','Piece',10000,'ready')",
      [tenant, garment],
    );
    await migration.query(
      "INSERT INTO stock(tenant_id,garment_id,size,quantity) VALUES($1,$2,'M',2)",
      [tenant, garment],
    );
  });
  afterAll(async () => {
    await database.close();
    await migration.end();
    await control.query(`DROP DATABASE IF EXISTS "${databaseName}"`);
    await control.end();
  });
  it('accepts only available stock under simultaneous buyers and leaves no partial orders', async () => {
    const results = await Promise.allSettled(
      Array.from({ length: 10 }, (_, i) =>
        checkout.place(tenant, {
          idempotencyKey: randomUUID(),
          lines: [{ garmentId: garment, size: 'M', quantity: 1 }],
          expectedTotal: 10000,
          buyer: {
            name: 'عميل اختبار',
            phone: `+2010000000${String(i).padStart(2, '0')}`,
            address: 'عنوان اختبار غير حقيقي',
          },
          phoneToken: 'test-only',
          cohort: 'viewer',
        }),
      ),
    );
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(2);
    for (const r of results)
      if (r.status === 'rejected')
        expect(r.reason).toEqual(new Error('STOCK_INSUFFICIENT'));
    await database.tenant(tenant, async (sql) => {
      expect((await sql.query('SELECT quantity FROM stock')).rows[0]?.['quantity']).toBe(
        0,
      );
      expect((await sql.query('SELECT * FROM orders')).rows).toHaveLength(2);
      expect((await sql.query('SELECT * FROM order_lines')).rows).toHaveLength(2);
    });
  });
});
