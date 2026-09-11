import { randomUUID } from 'node:crypto';
import { createHmac } from 'node:crypto';
import { Pool } from 'pg';
import { runMigrations } from '../packages/database/src/migrate.ts';

/**
 * One store, two garments, some stock, and one owner who can sign in.
 *
 * A clean clone has an empty database, and an empty database renders an empty shop, which
 * makes it impossible to tell a broken read path from a store with nothing in it. This is
 * the difference between `docker compose up` giving you a working system and giving you a
 * blank page you have to debug.
 *
 * Development only. It refuses to touch a database whose name does not say so, because
 * the one thing worse than no seed data is seed data in a pilot store's catalogue.
 *
 *   TALLA_MIGRATION_DATABASE_URL=... TALLA_INDEX_KEY=... node scripts/seed-dev.ts
 */

const url = process.env['TALLA_MIGRATION_DATABASE_URL'];
const indexKeyRaw = process.env['TALLA_INDEX_KEY'];
const ownerPhone = process.env['TALLA_SEED_OWNER_PHONE'] ?? '+201000000001';

if (url === undefined || indexKeyRaw === undefined) {
  process.stderr.write(
    'TALLA_MIGRATION_DATABASE_URL and TALLA_INDEX_KEY are required. Copy .env.example.\n',
  );
  process.exit(1);
}

const name = new URL(url).pathname.replace('/', '');
if (!/dev|local|test/.test(name)) {
  process.stderr.write(
    `Refusing to seed "${name}": the database name must contain dev, local or test.\n`,
  );
  process.exit(1);
}

const pool = new Pool({ connectionString: url });
const tenantId = randomUUID();
const ownerId = randomUUID();
const tee = randomUUID();
const jeans = randomUUID();

/** The same HMAC the application uses, so the seeded owner can actually sign in. */
const phoneHash = createHmac('sha256', Buffer.from(indexKeyRaw, 'base64'))
  .update(ownerPhone)
  .digest('hex');

/**
 * A spec shaped like the real contract, not like whatever the page happens to read.
 *
 * `block_id`, `style.slot` and `style.dominant_colors` are fields of the frozen
 * `GarmentSpec` (spec section 7), so the read path this exercises is the one Garment
 * Understanding will feed. `display` is the exception and is marked as such: reference
 * photographs are development material (ADR-0017) and the asset pipeline replaces them.
 */
function spec(
  blockId: string,
  slot: 'top' | 'bottom',
  colorHex: string,
  image: string,
  width: number,
  height: number,
): string {
  return JSON.stringify({
    spec_version: '1.0.0',
    block_id: blockId,
    style: { slot, dominant_colors: [colorHex] },
    display: { image, image_width: width, image_height: height },
  });
}

const client = await pool.connect();

try {
  await runMigrations(pool);

  await client.query(
    "INSERT INTO tenants (id, subdomain, name_ar, name_en) VALUES ($1, 'nasij', 'النسيج', 'Nasij') ON CONFLICT (subdomain) DO NOTHING",
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

  /**
   * Everything below this line is tenant scoped, and the seed obeys the same row-level
   * security the application does.
   *
   * The migration role owns these tables, and they FORCE row-level security, so ownership
   * buys nothing: without `app.current_tenant` the WITH CHECK matches no row and the
   * insert is refused. That is the policy working. Seeding through a superuser instead
   * would bypass it and leave the one obvious end-to-end exercise of tenant isolation
   * proving nothing (spec 12.3).
   */
  await client.query("SELECT set_config('app.current_tenant', $1, false)", [store]);

  await client.query(
    `INSERT INTO garments (tenant_id, id, name_ar, name_en, price, status, spec)
     VALUES ($1, $2, $3, $4, $5, 'ready', $6), ($1, $7, $8, $9, $10, 'ready', $11)
     ON CONFLICT DO NOTHING`,
    [
      store,
      tee,
      'تي شيرت قطن برقبة دائرية',
      'Crew neck cotton tee',
      65000,
      spec(
        'tee-crew-relaxed',
        'top',
        '#e9e4da',
        '/references/tee-front.webp',
        1795,
        2048,
      ),
      jeans,
      'جينز أزرق بقصة مستقيمة',
      'Straight leg blue jean',
      110000,
      spec('jeans-straight', 'bottom', '#3f5a7d', '/references/jeans.webp', 435, 650),
    ],
  );

  // The jean is short two sizes on purpose, so the sold-out path is visible without
  // anybody having to place an order first.
  for (const size of ['XS', 'S', 'M', 'L', 'XL', 'XXL']) {
    await client.query(
      'INSERT INTO stock (tenant_id, garment_id, size, quantity) VALUES ($1, $2, $3, 8) ON CONFLICT DO NOTHING',
      [store, tee, size],
    );
  }
  for (const size of ['S', 'M', 'L', 'XL']) {
    await client.query(
      'INSERT INTO stock (tenant_id, garment_id, size, quantity) VALUES ($1, $2, $3, 5) ON CONFLICT DO NOTHING',
      [store, jeans, size],
    );
  }

  process.stdout.write(`Seeded store "nasij" (${store}).\n`);
  process.stdout.write(`Owner sign in: ${ownerPhone}, code printed by the admin log.\n`);
} finally {
  client.release();
  await pool.end();
}
