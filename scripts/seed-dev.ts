import { createHash, createHmac, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { Pool } from 'pg';
import { runMigrations } from '../packages/database/src/migrate.ts';

/**
 * A complete local Talla storefront with stable, source-attributed demo merchandise.
 *
 * Development only. It refuses to touch a database whose name does not identify a local
 * environment. Product ids are derived from catalog keys, so rerunning this file updates
 * rows and stock instead of making duplicates.
 */

type Size = 'XS' | 'S' | 'M' | 'L' | 'XL' | 'XXL';

interface DemoProduct {
  readonly key: string;
  readonly name: string;
  readonly nameEn: string;
  readonly slot: 'top' | 'bottom' | 'outer';
  readonly blockId: string;
  readonly price: number;
  readonly compareAtPrice?: number;
  readonly colorHex: string;
  readonly colorLabel?: string;
  readonly colors: readonly string[];
  readonly sourceSizes: readonly string[];
  readonly allSourceSizes: readonly string[];
  readonly description?: string;
  readonly images: readonly {
    readonly url: string;
    readonly width: number;
    readonly height: number;
    readonly alt: string;
  }[];
  readonly source: {
    readonly merchant: string;
    readonly productUrl: string;
    readonly updatedAt?: string;
  };
  readonly sizeChart?: unknown;
  readonly image: string;
  readonly imageWidth: number;
  readonly imageHeight: number;
  readonly sizes: readonly Size[];
}

interface DemoCatalog {
  readonly products: readonly DemoProduct[];
}

const url = process.env['TALLA_MIGRATION_DATABASE_URL'];
const indexKeyRaw = process.env['TALLA_INDEX_KEY'];
const ownerPhone = process.env['TALLA_SEED_OWNER_PHONE'] ?? '+201000000001';

if (url === undefined || indexKeyRaw === undefined) {
  process.stderr.write(
    'TALLA_MIGRATION_DATABASE_URL and TALLA_INDEX_KEY are required. Copy .env.example.\n',
  );
  process.exit(1);
}

const databaseName = new URL(url).pathname.replace('/', '');
if (!/dev|local|test/.test(databaseName)) {
  process.stderr.write(
    `Refusing to seed "${databaseName}": the database name must contain dev, local or test.\n`,
  );
  process.exit(1);
}

const catalog = JSON.parse(
  readFileSync(new URL('./catalog/demo-catalog.json', import.meta.url), 'utf8'),
) as DemoCatalog;
const pool = new Pool({ connectionString: url });
const tenantId = randomUUID();
const ownerId = randomUUID();

/** A deterministic UUID-shaped identifier for one local catalog key. */
function stableId(key: string): string {
  const hex = createHash('sha256').update(`talla-demo:${key}`).digest('hex').slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20)}`;
}

function spec(product: DemoProduct): string {
  return JSON.stringify({
    spec_version: '1.0.0',
    block_id: product.blockId,
    style: { slot: product.slot, dominant_colors: [product.colorHex] },
  });
}

function publishedAssets(product: DemoProduct, sortOrder: number): string {
  return JSON.stringify({
    catalog_image: {
      url: product.image,
      width: product.imageWidth,
      height: product.imageHeight,
    },
    color_hex: product.colorHex,
    ...(product.colorLabel ? { color_label: product.colorLabel } : {}),
    colors: product.colors,
    source_sizes: product.sourceSizes,
    all_source_sizes: product.allSourceSizes,
    description: product.description,
    gallery: product.images,
    compare_at_price: product.compareAtPrice,
    source: {
      merchant: product.source.merchant,
      product_url: product.source.productUrl,
      updated_at: product.source.updatedAt,
    },
    size_chart: product.sizeChart,
    sort_order: sortOrder,
    demo_catalog: true,
  });
}

/** The same HMAC the application uses, so the seeded owner can actually sign in. */
const phoneHash = createHmac('sha256', Buffer.from(indexKeyRaw, 'base64'))
  .update(ownerPhone)
  .digest('hex');

const client = await pool.connect();

try {
  await runMigrations(pool);

  await client.query(
    `INSERT INTO tenants (id, subdomain, name_ar, name_en)
     VALUES ($1, 'nasij', 'طلّة', 'Talla')
     ON CONFLICT (subdomain) DO UPDATE SET name_ar = EXCLUDED.name_ar, name_en = EXCLUDED.name_en`,
    [tenantId],
  );
  const { rows: tenants } = await client.query<{ id: string }>(
    "SELECT id FROM tenants WHERE subdomain = 'nasij'",
  );
  const store = tenants[0]?.id ?? tenantId;

  await client.query(
    'INSERT INTO owners (id, phone_hash) VALUES ($1, $2) ON CONFLICT (phone_hash) DO NOTHING',
    [ownerId, phoneHash],
  );
  const { rows: owners } = await client.query<{ id: string }>(
    'SELECT id FROM owners WHERE phone_hash = $1',
    [phoneHash],
  );
  await client.query(
    "INSERT INTO owner_tenants (owner_id, tenant_id, role) VALUES ($1, $2, 'owner') ON CONFLICT DO NOTHING",
    [owners[0]?.id ?? ownerId, store],
  );

  await client.query("SELECT set_config('app.current_tenant', $1, false)", [store]);
  await client.query('BEGIN');
  try {
    // Keep old local orders readable while removing records that disappeared from the
    // current source snapshot. Current records are reactivated by the upsert below.
    await client.query(
      "UPDATE garments SET status = 'archived' WHERE published_assets IS NULL AND spec ? 'display'",
    );
    await client.query(
      `UPDATE garments
       SET status = 'archived'
       WHERE published_assets @> '{"demo_catalog":true}'::jsonb`,
    );

    for (const [sortOrder, product] of catalog.products.entries()) {
      const garmentId = stableId(product.key);
      await client.query(
        `INSERT INTO garments
           (tenant_id, id, name_ar, name_en, price, status, spec, published_assets)
         VALUES ($1, $2, $3, $4, $5, 'ready', $6, $7)
         ON CONFLICT (tenant_id, id) DO UPDATE SET
           name_ar = EXCLUDED.name_ar,
           name_en = EXCLUDED.name_en,
           price = EXCLUDED.price,
           status = 'ready',
           spec = EXCLUDED.spec,
           published_assets = EXCLUDED.published_assets`,
        [
          store,
          garmentId,
          product.name,
          product.nameEn,
          product.price,
          spec(product),
          publishedAssets(product, sortOrder),
        ],
      );
      await client.query(
        'UPDATE stock SET quantity = 0 WHERE tenant_id = $1 AND garment_id = $2',
        [store, garmentId],
      );
      for (const size of product.sizes) {
        await client.query(
          `INSERT INTO stock (tenant_id, garment_id, size, quantity)
           VALUES ($1, $2, $3, 8)
           ON CONFLICT (tenant_id, garment_id, size) DO UPDATE SET quantity = EXCLUDED.quantity`,
          [store, garmentId, size],
        );
      }
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }

  process.stdout.write(
    `Seeded store "nasij" (${store}) with ${String(catalog.products.length)} products.\n`,
  );
  process.stdout.write(`Owner sign in: ${ownerPhone}, code printed by the admin log.\n`);
} finally {
  client.release();
  await pool.end();
}
