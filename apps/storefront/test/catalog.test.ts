import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { tenantTransaction } from '@talla/database';
import { runMigrations } from '@talla/database/migrate';
import { readCatalog, toProduct } from '../server/catalog.ts';
import type { CatalogProduct } from '../product.ts';

const db = new PGlite();
const store = '11111111-1111-4111-8111-111111111111';
const other = '22222222-2222-4222-8222-222222222222';

const spec = (blockId: string, slot: string, colorHex: string): string =>
  JSON.stringify({
    spec_version: '1.0.0',
    block_id: blockId,
    style: { slot, dominant_colors: [colorHex] },
    display: { image: '/references/tee-front.webp', image_width: 10, image_height: 20 },
  });

async function garment(
  tenantId: string,
  name: string,
  status: string,
  specJson: string | null,
  sizes: readonly string[],
): Promise<string> {
  const id = randomUUID();
  await tenantTransaction(db, tenantId, async (sql) => {
    await sql.query(
      'INSERT INTO garments (tenant_id,id,name_ar,name_en,price,status,spec) VALUES ($1,$2,$3,$3,$4,$5,$6)',
      [tenantId, id, name, 5000, status, specJson],
    );
    for (const size of sizes) {
      await sql.query(
        'INSERT INTO stock (tenant_id,garment_id,size,quantity) VALUES ($1,$2,$3,$4)',
        [tenantId, id, size, size === 'XS' ? 0 : 3],
      );
    }
  });
  return id;
}

beforeAll(async () => {
  await runMigrations(db);
  await db.query(
    "INSERT INTO tenants (id,subdomain,name_ar,name_en) VALUES ($1,'store-a','أ','A'),($2,'store-b','ب','B')",
    [store, other],
  );
  await db.exec('SET ROLE talla_app');
}, 60_000);

beforeEach(async () => {
  for (const tenantId of [store, other]) {
    await tenantTransaction(db, tenantId, async (sql) => {
      await sql.query('DELETE FROM stock');
      await sql.query('DELETE FROM garments');
    });
  }
});

afterAll(async () => {
  await db.close();
});

const catalog = (tenantId: string): Promise<readonly CatalogProduct[]> =>
  tenantTransaction(db, tenantId, (sql) => readCatalog(sql));

describe('readCatalog', () => {
  it('returns a ready garment with only the sizes that have stock', async () => {
    await garment(store, 'تي شيرت', 'ready', spec('tee-crew-relaxed', 'top', '#e9e4da'), [
      'XS',
      'S',
      'M',
    ]);

    const products = await catalog(store);
    expect(products).toHaveLength(1);
    // XS was stocked at zero. A size a buyer cannot have is not offered.
    expect(products[0]?.sizes).toEqual(['S', 'M']);
    expect(products[0]?.slot).toBe('top');
    expect(products[0]?.colorHex).toBe('#e9e4da');
  });

  it('keeps a garment with no stock at all, so the page can say sold out', async () => {
    await garment(
      store,
      'جينز',
      'ready',
      spec('jeans-straight', 'bottom', '#3f5a7d'),
      [],
    );

    const products = await catalog(store);
    expect(products).toHaveLength(1);
    expect(products[0]?.sizes).toEqual([]);
  });

  it('shows nothing that is not ready', async () => {
    for (const status of ['draft', 'processing', 'confirmation', 'failed', 'archived']) {
      await garment(store, status, status, spec('tee-crew-relaxed', 'top', '#fff'), [
        'M',
      ]);
    }
    expect(await catalog(store)).toEqual([]);
  });

  it('skips a garment whose spec cannot dress the mannequin', async () => {
    // A placeholder on a storefront is worse than an absence: the owner cannot see that
    // anything is wrong, and the buyer sees a garment that is not the one they get.
    await garment(store, 'بلا مواصفات', 'ready', null, ['M']);
    await garment(store, 'كتلة مجهولة', 'ready', spec('not-a-block', 'top', '#fff'), [
      'M',
    ]);
    await garment(
      store,
      'خانة مجهولة',
      'ready',
      spec('tee-crew-relaxed', 'hat', '#fff'),
      ['M'],
    );

    expect(await catalog(store)).toEqual([]);
  });

  it('reads only the tenant in context', async () => {
    await garment(store, 'لنا', 'ready', spec('tee-crew-relaxed', 'top', '#fff'), ['M']);
    await garment(other, 'لهم', 'ready', spec('tee-crew-relaxed', 'top', '#fff'), ['M']);

    // Row-level security, not a WHERE clause: `readCatalog` never names a tenant.
    expect((await catalog(store)).map((p) => p.name)).toEqual(['لنا']);
    expect((await catalog(other)).map((p) => p.name)).toEqual(['لهم']);
  });
});

describe('toProduct', () => {
  it('rejects a spec missing any field the viewer needs', () => {
    const complete = {
      id: 'g1',
      name_ar: 'قطعة',
      price: 100,
      sizes: ['M'],
      spec: JSON.parse(spec('tee-crew-relaxed', 'top', '#fff')) as unknown,
    };
    expect(toProduct(complete)).toBeDefined();

    for (const drop of ['block_id', 'style', 'display']) {
      const full = JSON.parse(spec('tee-crew-relaxed', 'top', '#fff')) as Record<
        string,
        unknown
      >;
      // Rebuilt without the key rather than deleted from: same result, and it does not
      // need an escape hatch from the linter to say so.
      const partial = Object.fromEntries(
        Object.entries(full).filter(([key]) => key !== drop),
      );
      expect(toProduct({ ...complete, spec: partial }), drop).toBeUndefined();
    }
  });

  it('reads published catalog assets, source measurements and the expanded 3D blocks', () => {
    const product = toProduct({
      id: 'g2',
      name_ar: 'قميص طويل',
      price: 59900,
      sizes: ['L'],
      spec: {
        block_id: 'tee-long-relaxed',
        style: { slot: 'top', dominant_colors: ['#000000'] },
      },
      published_assets: {
        catalog_image: { url: '/catalog/farid/top.webp', width: 720, height: 900 },
        color_hex: '#17181a',
        color_label: 'أسود',
        source: {
          merchant: 'Farid Store',
          product_url: 'https://faridstore.site/products/top',
        },
        size_chart: {
          rows: {
            L: {
              sourceLabel: 'L',
              measurements: [{ key: 'width', label: 'العرض', value: '60', unit: 'سم' }],
            },
          },
          notes: ['كما ورد في المصدر.'],
        },
      },
    });

    expect(product?.blockId).toBe('tee-long-relaxed');
    expect(product?.image).toBe('/catalog/farid/top.webp');
    expect(product?.colorLabel).toBe('أسود');
    expect(product?.sizeChart?.rows.L?.sourceLabel).toBe('L');
    expect(product?.sizeChart?.rows.L?.measurements[0]).toEqual({
      key: 'width',
      label: 'العرض',
      value: '60',
      unit: 'سم',
    });
    expect(product?.source?.merchant).toBe('Farid Store');
  });
});
