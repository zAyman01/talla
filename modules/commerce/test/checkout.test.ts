import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { beforeAll, afterAll, expect, it } from 'vitest';
import { tenantTransaction, createPrivacyBox } from '@talla/database';
import { createCheckout, normalizeLines, whatsappHandoff } from '../index.ts';
import type { CheckoutInput } from '../index.ts';

const tenant = '11111111-1111-4111-8111-111111111111';
const garment = '33333333-3333-4333-8333-333333333333';
const db = new PGlite();
const privacy = createPrivacyBox(new Uint8Array(32).fill(1),new Uint8Array(32).fill(2));
const checkout = createCheckout({ database: { tenant: (id,work) => tenantTransaction(db,id,work), close: async () => { await db.close(); } },
  verifyPhone: (token) => Promise.resolve(token === 'verified-by-provider'),
  sealBuyer: (buyer,id) => privacy.seal(buyer,id), phoneHash: privacy.phoneHash });
beforeAll(async () => {
  await db.exec(await readFile(new URL('../../../packages/database/migrations/001-initial.sql',import.meta.url),'utf8'));
  await db.query("INSERT INTO tenants (id,subdomain,name_ar,name_en) VALUES ($1,'test-store','اختبار','Test')",[tenant]);
  await db.query("INSERT INTO garments (tenant_id,id,name_ar,name_en,price,status) VALUES ($1,$2,'تي شيرت','Tee',25000,'ready')",[tenant,garment]);
  await db.query("INSERT INTO stock (tenant_id,garment_id,size,quantity) VALUES ($1,$2,'M',3)",[tenant,garment]);
  await db.exec('SET ROLE talla_app');
},30000);
afterAll(async () => { await db.close(); });
function input(): CheckoutInput {
  return { idempotencyKey: randomUUID(), lines: [{ garmentId: garment,size:'M',quantity:1 }], expectedTotal:25000,
    buyer: { name:'اسم الاختبار',phone:'+201000000000',address:'عنوان تجريبي لا يمثل مشترياً حقيقياً' }, phoneToken:'verified-by-provider',cohort:'viewer' };
}
it('rejects a stale price and unverified phone without deducting stock', async () => {
  await expect(checkout.place(tenant,{...input(),expectedTotal:1})).rejects.toThrow('ORDER_TOTAL_MISMATCH');
  await expect(checkout.place(tenant,{...input(),phoneToken:'forged'})).rejects.toThrow('ORDER_PHONE_UNVERIFIED');
  await tenantTransaction(db,tenant,async(sql) => { expect((await sql.query('SELECT quantity FROM stock')).rows[0]?.['quantity']).toBe(3); });
});
it('places an order once, encrypts PII and replays the same receipt without another stock deduction', async () => {
  const request = input();
  const first = await checkout.place(tenant,request);
  expect(await checkout.place(tenant,request)).toEqual(first);
  await expect(checkout.place(tenant,{...request,expectedTotal:1})).rejects.toThrow('IDEMPOTENCY');
  await tenantTransaction(db,tenant,async(sql) => {
    expect((await sql.query('SELECT quantity FROM stock')).rows[0]?.['quantity']).toBe(2);
    const row = (await sql.query<{ buyer_ciphertext: string }>('SELECT buyer_ciphertext FROM orders')).rows[0];
    expect(row?.buyer_ciphertext).not.toContain(request.buyer.phone);
    if (!row) throw new Error('Missing order');
    expect(privacy.open(row.buyer_ciphertext,tenant)).toEqual(request.buyer);
    expect(() => privacy.open(row.buyer_ciphertext,'other-tenant')).toThrow();
    expect(JSON.stringify((await sql.query('SELECT details FROM audit_log')).rows)).not.toContain(request.buyer.phone);
  });
});
it('merges duplicate lines so they cannot oversell stock', async () => {
  const request = input();
  await expect(checkout.place(tenant,{...request,lines:[...request.lines,...request.lines,...request.lines],expectedTotal:75000})).rejects.toThrow('STOCK_INSUFFICIENT');
  expect(normalizeLines([...request.lines,...request.lines])[0]?.quantity).toBe(2);
});
it('shares only a reference and store link with WhatsApp', () => {
  const url = whatsappHandoff('+201111111111','https://store.talla.app','A'.repeat(24));
  expect(new URL(url).searchParams.get('text')).toBe(`طلب ${'A'.repeat(24)}\nhttps://store.talla.app/orders/${'A'.repeat(24)}`);
  expect(() => whatsappHandoff('+201111111111','javascript:alert(1)','A'.repeat(24))).toThrow();
});
