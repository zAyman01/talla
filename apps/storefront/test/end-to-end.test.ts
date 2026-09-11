import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { createPrivacyBox, tenantTransaction } from '@talla/database';
import { runMigrations } from '@talla/database/migrate';
import type { Database, Sql } from '@talla/database';
import { conceal } from '@talla/sensitive';
import { createLogger } from '@talla/observability';
import {
  createCheckout,
  createPhoneVerification,
  verifyPhoneToken,
} from '@talla/commerce';
import { createTenantRequests } from '../server/request.ts';
import { readCatalog } from '../server/catalog.ts';

/**
 * The Stage S exit gate, as one test.
 *
 * A buyer arrives at a store's subdomain, sees a catalogue read from PostgreSQL, picks an
 * outfit, verifies a phone number, and places a cash-on-delivery order that lands in
 * `orders` with an encrypted buyer record.
 *
 * Every module this touches was a tested library with no caller when Stage S started.
 * This is the test that says they compose, which is the thing eight tasks of unit tests
 * could not tell us.
 *
 * It exercises the composed services rather than the HTTP handlers, because the handlers
 * only add request parsing and the `container` that reads configuration. What is proven
 * here is the part that would still be wrong if the seams were wrong.
 */

const db = new PGlite();
const store = '11111111-1111-4111-8111-111111111111';
const other = '22222222-2222-4222-8222-222222222222';
const tee = randomUUID();
const jeans = randomUUID();

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

const privacy = createPrivacyBox(new Uint8Array(32).fill(1), new Uint8Array(32).fill(2));
const phoneSecret = new Uint8Array(32).fill(3);
const logger = createLogger({ sink: () => undefined, policy: 'throw' });

const requests = createTenantRequests({ database, rootDomain: 'talla.app', logger });
const codes: string[] = [];
const phone = createPhoneVerification({
  database,
  secret: phoneSecret,
  phoneHash: privacy.phoneHash,
  sendCode: (_number, code) => {
    codes.push(code);
    return Promise.resolve();
  },
});
const checkout = createCheckout({
  database,
  sealBuyer: privacy.sealBuyer,
  verifyPhone: (token, phoneHash, tenantId) =>
    Promise.resolve(verifyPhoneToken(phoneSecret, token, phoneHash, tenantId)),
});

const BUYER_PHONE = '+201000000055';
const BUYER_ADDRESS = '12 شارع الجمهورية، وسط البلد، القاهرة';

function spec(blockId: string, slot: string, colorHex: string): string {
  return JSON.stringify({
    spec_version: '1.0.0',
    block_id: blockId,
    style: { slot, dominant_colors: [colorHex] },
    display: { image: '/references/tee-front.webp', image_width: 10, image_height: 20 },
  });
}

beforeAll(async () => {
  await runMigrations(db);
  await db.query(
    `INSERT INTO tenants (id, subdomain, name_ar, name_en) VALUES
       ($1,'nasij','النسيج','Nasij'), ($2,'other','آخر','Other')`,
    [store, other],
  );
  // Distinct creation times, because that is what the catalogue orders by and a store
  // does not upload two pieces in the same instant.
  await db.query(
    `INSERT INTO garments (tenant_id,id,name_ar,name_en,price,status,spec,created_at) VALUES
       ($1,$2,'تي شيرت','Tee',65000,'ready',$3,'2026-09-01'),
       ($1,$4,'جينز','Jean',110000,'ready',$5,'2026-09-02')`,
    [
      store,
      tee,
      spec('tee-crew-relaxed', 'top', '#e9e4da'),
      jeans,
      spec('jeans-straight', 'bottom', '#3f5a7d'),
    ],
  );
  for (const [garment, sizes] of [
    [tee, ['S', 'M', 'L']],
    [jeans, ['M', 'L']],
  ] as const) {
    for (const size of sizes) {
      await db.query(
        'INSERT INTO stock (tenant_id,garment_id,size,quantity) VALUES ($1,$2,$3,4)',
        [store, garment, size],
      );
    }
  }
  await db.exec('SET ROLE talla_app');
}, 60_000);

afterAll(async () => {
  await db.close();
});

it('takes a buyer from a subdomain to a cash-on-delivery order', async () => {
  // 1. The host names the store. Nothing else does.
  const catalogue = await requests.withTenant('nasij.talla.app', 'trace-e2e', (sql) =>
    readCatalog(sql),
  );
  if (!catalogue.ok) throw new Error('the store did not resolve');
  expect(catalogue.value.map((product) => product.name)).toEqual(['تي شيرت', 'جينز']);

  // 2. An outfit: the tee and the jean, in a size both have.
  const lines = catalogue.value.map((product) => ({
    garmentId: product.id,
    size: 'M' as const,
    quantity: 1,
  }));

  // 3. The server prices it. The client never sends a price (spec 12.5).
  const quoted = await checkout.quote(store, lines);
  if (!quoted.ok) throw new Error(`quote failed: ${quoted.error}`);
  expect(quoted.value.total).toBe(175000);

  // 4. The buyer verifies a phone number before the order is accepted (ADR-0007).
  const challenge = await phone.start(store, BUYER_PHONE, '203.0.113.44');
  const code = codes.at(-1);
  if (code === undefined) throw new Error('no code was sent');
  const verified = await phone.verify(store, challenge.challengeId, BUYER_PHONE, code);

  // 5. The order. Buyer fields are concealed at this boundary and never unwrapped again
  //    outside the privacy box (ADR-0020).
  const idempotencyKey = randomUUID();
  const order = {
    idempotencyKey,
    lines,
    expectedTotal: quoted.value.total,
    buyer: {
      name: conceal('ليلى'),
      phone: conceal(BUYER_PHONE),
      address: conceal(BUYER_ADDRESS),
    },
    phoneToken: verified.token,
    cohort: 'viewer' as const,
  };
  const placed = await checkout.place(store, order);
  if (!placed.ok) throw new Error(`order failed: ${placed.error}`);
  expect(placed.value.total).toBe(175000);

  // 6. It landed, encrypted, with stock decremented in the same transaction.
  await tenantTransaction(db, store, async (sql) => {
    const { rows } = await sql.query<{
      reference: string;
      total: number;
      buyer_ciphertext: string;
      cohort: string;
    }>('SELECT reference, total, buyer_ciphertext, cohort FROM orders');
    expect(rows).toHaveLength(1);
    expect(rows[0]?.reference).toBe(placed.value.reference);
    expect(rows[0]?.buyer_ciphertext).not.toContain(BUYER_PHONE);
    expect(rows[0]?.buyer_ciphertext).not.toContain('الجمهورية');
    expect(privacy.open(rows[0]?.buyer_ciphertext ?? '', store)).toEqual({
      name: 'ليلى',
      phone: BUYER_PHONE,
      address: BUYER_ADDRESS,
    });

    const { rows: stock } = await sql.query<{ quantity: number }>(
      "SELECT quantity FROM stock WHERE size = 'M' ORDER BY garment_id",
    );
    expect(stock.map((row) => row.quantity)).toEqual([3, 3]);
  });

  // 7. A replay of the same submission returns the same receipt, not a second order.
  const replay = await checkout.place(store, order);
  expect(replay).toEqual(placed);
  await tenantTransaction(db, store, async (sql) => {
    const { rows } = await sql.query<{ count: number }>(
      'SELECT count(*)::int AS count FROM orders',
    );
    expect(rows[0]?.count).toBe(1);
  });
});

it('shows a buyer on the wrong host no catalogue at all', async () => {
  // A host that names no store, and a store that exists but is not this one, are the
  // same answer. The second is the one that matters: getting the host wrong yields
  // nothing rather than somebody else's shop.
  expect(
    await requests.withTenant('nobody.talla.app', 't', (sql) => readCatalog(sql)),
  ).toEqual({ ok: false, error: 'AUTH_FORBIDDEN' });

  const theirs = await requests.withTenant('other.talla.app', 't', (sql) =>
    readCatalog(sql),
  );
  expect(theirs.ok && theirs.value).toEqual([]);
});
