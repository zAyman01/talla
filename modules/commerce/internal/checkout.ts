import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { Database, Sql } from '@talla/database';

type Size = 'XS' | 'S' | 'M' | 'L' | 'XL' | 'XXL';
interface Line { readonly garmentId: string; readonly size: Size; readonly quantity: number }
interface Buyer { readonly name: string; readonly phone: string; readonly address: string }
export interface CheckoutInput {
  readonly idempotencyKey: string;
  readonly lines: readonly Line[];
  readonly expectedTotal: number;
  readonly buyer: Buyer;
  readonly phoneToken: string;
  readonly cohort: 'viewer' | 'control';
}
export interface CheckoutReceipt { readonly id: string; readonly reference: string; readonly total: number }
export interface CheckoutDependencies {
  readonly database: Database;
  readonly verifyPhone: (token: string, phone: string, tenantId: string) => Promise<boolean>;
  readonly sealBuyer: (buyer: Buyer, tenantId: string) => string;
  readonly phoneHash: (phone: string) => string;
}
export interface CheckoutService {
  quote(tenantId: string, lines: readonly Line[]): Promise<{ total: number; lines: readonly (Line & { unitPrice: number })[] }>;
  place(tenantId: string, input: CheckoutInput): Promise<CheckoutReceipt>;
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const sizes: readonly string[] = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];

export function normalizeLines(lines: readonly Line[]): readonly Line[] {
  if (lines.length === 0 || lines.length > 30) throw new Error('ORDER_INVALID_INPUT');
  const merged = new Map<string, Line>();
  for (const line of lines) {
    if (!uuid.test(line.garmentId) || !sizes.includes(line.size) || !Number.isSafeInteger(line.quantity) || line.quantity < 1 || line.quantity > 10) throw new Error('ORDER_INVALID_INPUT');
    const key = `${line.garmentId.toLowerCase()}:${line.size}`;
    const quantity = (merged.get(key)?.quantity ?? 0) + line.quantity;
    if (quantity > 10) throw new Error('ORDER_INVALID_INPUT');
    merged.set(key, { garmentId: line.garmentId.toLowerCase(), size: line.size, quantity });
  }
  return [...merged.values()].sort((a, b) => a.garmentId.localeCompare(b.garmentId) || a.size.localeCompare(b.size));
}

async function quote(sql: Sql, lines: readonly Line[]): Promise<{ total: number; lines: (Line & { unitPrice: number })[] }> {
  const priced: (Line & { unitPrice: number })[] = [];
  for (const line of lines) {
    const { rows } = await sql.query<{ price: number; quantity: number }>(`
      SELECT g.price,s.quantity FROM garments g JOIN stock s ON s.tenant_id=g.tenant_id AND s.garment_id=g.id
      WHERE g.id=$1 AND s.size=$2 AND g.status='ready' FOR UPDATE OF g,s`, [line.garmentId, line.size]);
    const row = rows[0];
    if (!row || row.quantity < line.quantity) throw new Error('STOCK_INSUFFICIENT');
    priced.push({ ...line, unitPrice: row.price });
  }
  const total = priced.reduce((sum, line) => sum + line.quantity * line.unitPrice, 0);
  if (!Number.isSafeInteger(total) || total <= 0 || total > 2_147_483_647) throw new Error('ORDER_INVALID_INPUT');
  return { total, lines: priced };
}

export function createCheckout(deps: CheckoutDependencies): CheckoutService {
  return {
    quote: (tenantId, lines) => deps.database.tenant(tenantId, (sql) => quote(sql, normalizeLines(lines))),
    async place(tenantId, input): Promise<CheckoutReceipt> {
      const lines = normalizeLines(input.lines);
      if (!uuid.test(input.idempotencyKey) || !Number.isSafeInteger(input.expectedTotal) || input.expectedTotal <= 0 ||
        !/^\+[1-9]\d{7,14}$/.test(input.buyer.phone) || input.buyer.name.trim().length < 2 || input.buyer.name.length > 120 ||
        input.buyer.address.trim().length < 10 || input.buyer.address.length > 500 || !['viewer','control'].includes(input.cohort)) throw new Error('ORDER_INVALID_INPUT');
      if (!await deps.verifyPhone(input.phoneToken, input.buyer.phone, tenantId)) throw new Error('ORDER_PHONE_UNVERIFIED');
      const phoneHash = deps.phoneHash(input.buyer.phone);
      const requestHash = createHash('sha256').update(JSON.stringify({ lines, buyer: input.buyer, total: input.expectedTotal, cohort: input.cohort })).digest('hex');
      return deps.database.tenant(tenantId, async (sql) => {
        // Serialize duplicate submissions and orders for one phone before any stock lock.
        await sql.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [`${tenantId}:${phoneHash}`]);
        await sql.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [`${tenantId}:${input.idempotencyKey}`]);
        const existing = (await sql.query<{ id: string; reference: string; total: number; request_hash: string }>('SELECT id,reference,total,request_hash FROM orders WHERE idempotency_key=$1', [input.idempotencyKey])).rows[0];
        if (existing) {
          if (existing.request_hash !== requestHash) throw new Error('ORDER_IDEMPOTENCY_CONFLICT');
          return { id: existing.id, reference: existing.reference, total: existing.total };
        }
        const recent = (await sql.query<{ count: number }>("SELECT count(*)::int AS count FROM orders WHERE buyer_phone_hash=$1 AND created_at > now()-interval '24 hours'", [phoneHash])).rows[0];
        if ((recent?.count ?? 0) >= 3) throw new Error('ORDER_RATE_LIMITED');
        const priced = await quote(sql, lines);
        if (priced.total !== input.expectedTotal) throw new Error('ORDER_TOTAL_MISMATCH');
        const receipt = { id: randomUUID(), reference: randomBytes(12).toString('hex').toUpperCase(), total: priced.total };
        await sql.query(`INSERT INTO orders (tenant_id,id,idempotency_key,request_hash,reference,total,buyer_ciphertext,buyer_phone_hash,cohort)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`, [tenantId,receipt.id,input.idempotencyKey,requestHash,receipt.reference,receipt.total,deps.sealBuyer(input.buyer,tenantId),phoneHash,input.cohort]);
        for (const line of priced.lines) {
          await sql.query('UPDATE stock SET quantity=quantity-$1 WHERE garment_id=$2 AND size=$3', [line.quantity,line.garmentId,line.size]);
          await sql.query('UPDATE garments SET stock_epoch=stock_epoch+1 WHERE id=$1', [line.garmentId]);
          await sql.query('INSERT INTO order_lines (tenant_id,order_id,garment_id,size,quantity,unit_price) VALUES ($1,$2,$3,$4,$5,$6)', [tenantId,receipt.id,line.garmentId,line.size,line.quantity,line.unitPrice]);
        }
        await sql.query("INSERT INTO audit_log (tenant_id,actor_id,action,entity_id,details) VALUES ($1,'buyer','order.placed',$2,$3)", [tenantId,receipt.id,JSON.stringify({ total: receipt.total, itemCount: lines.reduce((n,l) => n+l.quantity,0) })]);
        return receipt;
      });
    },
  };
}

/** Store phone and origin come from server configuration. Never include buyer PII. */
export function whatsappHandoff(storePhone: string, storeOrigin: string, reference: string): string {
  const origin = new URL(storeOrigin);
  if (!/^\+[1-9]\d{7,14}$/.test(storePhone) || origin.protocol !== 'https:' || origin.username || origin.password || !/^[A-F0-9]{24}$/.test(reference)) throw new Error('Invalid handoff configuration');
  const link = new URL(`/orders/${reference}`, origin.origin);
  return `https://wa.me/${storePhone.slice(1)}?text=${encodeURIComponent(`طلب ${reference}\n${link.href}`)}`;
}
