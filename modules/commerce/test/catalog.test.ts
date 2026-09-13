import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { tenantTransaction } from '@talla/database';
import type { Database } from '@talla/database';
import { listCatalog } from '../index.ts';

const tenant = '11111111-1111-4111-8111-111111111111';
const otherTenant = '22222222-2222-4222-8222-222222222222';
const visible = '33333333-3333-4333-8333-333333333333';
const hidden = '44444444-4444-4444-8444-444444444444';
const db = new PGlite();
const database: Database = {
  tenant: (tenantId, work) => tenantTransaction(db, tenantId, work),
  close: () => db.close(),
};

beforeAll(async () => {
  await db.exec(
    await readFile(
      new URL('../../../packages/database/migrations/001-initial.sql', import.meta.url),
      'utf8',
    ),
  );
  await db.query(
    "INSERT INTO tenants(id,subdomain,name_ar,name_en) VALUES($1,'catalog-one','الأول','One'),($2,'catalog-two','الثاني','Two')",
    [tenant, otherTenant],
  );
  const spec = JSON.stringify({ style: { slot: 'top' } });
  const assets = JSON.stringify({
    catalog_image: { url: '/references/tee-front.webp', width: 1795, height: 2048 },
  });
  await db.query(
    `INSERT INTO garments(tenant_id,id,name_ar,name_en,price,status,spec,published_assets)
     VALUES($1,$2,'قميص جاهز','Ready tee',65000,'ready',$3,$4),
           ($1,$5,'مسودة','Draft',50000,'draft',$3,$4),
           ($6,$2,'قطعة متجر آخر','Other tenant',70000,'ready',$3,$4)`,
    [tenant, visible, spec, assets, hidden, otherTenant],
  );
  await db.query(
    `INSERT INTO stock(tenant_id,garment_id,size,quantity)
     VALUES($1,$2,'M',2),($1,$2,'L',0),($1,$3,'M',4),($4,$2,'M',5)`,
    [tenant, visible, hidden, otherTenant],
  );
  await db.exec('SET ROLE talla_app');
}, 30_000);

afterAll(async () => {
  await db.close();
});

it('returns only complete ready garments with stock from the active tenant', async () => {
  await expect(listCatalog(database, tenant)).resolves.toEqual([
    {
      id: visible,
      name: 'قميص جاهز',
      price: 65000,
      category: 'top',
      categoryLabel: 'قطعة علوية',
      image: { url: '/references/tee-front.webp', width: 1795, height: 2048 },
      sizes: ['M'],
    },
  ]);
});
