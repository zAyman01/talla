import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { Database, SealedBuyer, Sql } from '@talla/database';
import { satisfies, type Sensitive } from '@talla/sensitive';
import { codedError, isCodedError } from '@talla/errors';
import type { ErrorCode } from '@talla/errors';
import type { Result } from '@talla/shared';

type Size = 'XS' | 'S' | 'M' | 'L' | 'XL' | 'XXL';
interface Line {
  readonly garmentId: string;
  readonly size: Size;
  readonly quantity: number;
}
/**
 * Concealed at the request boundary and never unwrapped here. The only thing that takes
 * the plaintext out is the privacy box, which does it to encrypt it (ADR-0020).
 */
interface Buyer {
  readonly name: Sensitive<string>;
  readonly phone: Sensitive<string>;
  readonly address: Sensitive<string>;
}
export interface CheckoutInput {
  readonly idempotencyKey: string;
  readonly lines: readonly Line[];
  readonly expectedTotal: number;
  readonly buyer: Buyer;
  readonly phoneToken: string;
  readonly cohort: 'viewer' | 'control';
  /** Privacy notice accepted at the request boundary, when that surface records it. */
  readonly privacyNoticeVersion?: '2026-09-09';
}
export interface CheckoutReceipt {
  readonly id: string;
  readonly reference: string;
  readonly total: number;
}
export interface CheckoutDependencies {
  readonly database: Database;
  readonly sealBuyer: (buyer: Buyer, tenantId: string) => SealedBuyer;
  /**
   * Takes the phone index, not the number. The token was minted against the same hash,
   * so the plaintext buys nothing here and would only be one more place it exists.
   */
  readonly verifyPhone: (
    token: string,
    phoneHash: string,
    tenantId: string,
  ) => Promise<boolean>;
}
export interface PricedLines {
  readonly total: number;
  readonly lines: readonly (Line & { unitPrice: number })[];
}

/** Everything a buyer can be told about a checkout, and nothing else. */
export type CheckoutFailure = Extract<ErrorCode, `ORDER_${string}` | `STOCK_${string}`>;

export interface CheckoutService {
  quote(
    tenantId: string,
    lines: readonly Line[],
  ): Promise<Result<PricedLines, CheckoutFailure>>;
  place(
    tenantId: string,
    input: CheckoutInput,
  ): Promise<Result<CheckoutReceipt, CheckoutFailure>>;
}

const CHECKOUT_CODE = /^(?:ORDER|STOCK)_/;

/**
 * Turn a thrown failure into a `Result`, and let everything else keep throwing.
 *
 * Only codes this service is allowed to produce are converted. Anything else, a driver
 * failure or a programmer-error invariant, propagates: collapsing a bug into a typed
 * failure hides it from a caller who would then retry it forever, and the HTTP layer is
 * the place that turns an unrecognised throw into `INTERNAL_ERROR` with a trace id.
 *
 * The throw itself stays because work inside `database.tenant` must throw to roll the
 * transaction back. Returning a failure from in there would commit it.
 */
async function asResult<T>(work: () => Promise<T>): Promise<Result<T, CheckoutFailure>> {
  try {
    return { ok: true, value: await work() };
  } catch (error) {
    if (isCodedError(error) && CHECKOUT_CODE.test(error.code)) {
      // Narrowed by the guard above: the pattern is the runtime half of the type.
      return { ok: false, error: error.code as CheckoutFailure };
    }
    throw error;
  }
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const sizes: readonly string[] = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];

export function normalizeLines(lines: readonly Line[]): readonly Line[] {
  if (lines.length === 0 || lines.length > 30) throw codedError('ORDER_INVALID_INPUT');
  const merged = new Map<string, Line>();
  for (const line of lines) {
    if (
      !uuid.test(line.garmentId) ||
      !sizes.includes(line.size) ||
      !Number.isSafeInteger(line.quantity) ||
      line.quantity < 1 ||
      line.quantity > 10
    )
      throw codedError('ORDER_INVALID_INPUT');
    const key = `${line.garmentId.toLowerCase()}:${line.size}`;
    const quantity = (merged.get(key)?.quantity ?? 0) + line.quantity;
    if (quantity > 10) throw codedError('ORDER_INVALID_INPUT');
    merged.set(key, {
      garmentId: line.garmentId.toLowerCase(),
      size: line.size,
      quantity,
    });
  }
  return [...merged.values()].sort(
    (a, b) => a.garmentId.localeCompare(b.garmentId) || a.size.localeCompare(b.size),
  );
}

async function quote(
  sql: Sql,
  lines: readonly Line[],
): Promise<{ total: number; lines: (Line & { unitPrice: number })[] }> {
  const priced: (Line & { unitPrice: number })[] = [];
  for (const line of lines) {
    const garment = (
      await sql.query<{ price: number }>(
        "SELECT price FROM garments WHERE id=$1 AND status='ready' FOR UPDATE",
        [line.garmentId],
      )
    ).rows[0];
    const stock = (
      await sql.query<{ quantity: number }>(
        'SELECT quantity FROM stock WHERE garment_id=$1 AND size=$2 FOR UPDATE',
        [line.garmentId, line.size],
      )
    ).rows[0];
    if (!garment || !stock || stock.quantity < line.quantity)
      throw codedError('STOCK_INSUFFICIENT');
    priced.push({ ...line, unitPrice: garment.price });
  }
  const total = priced.reduce((sum, line) => sum + line.quantity * line.unitPrice, 0);
  if (!Number.isSafeInteger(total) || total <= 0 || total > 2_147_483_647)
    throw codedError('ORDER_INVALID_INPUT');
  return { total, lines: priced };
}

export function createCheckout(deps: CheckoutDependencies): CheckoutService {
  return {
    quote: (tenantId, lines) =>
      asResult(() =>
        deps.database.tenant(tenantId, (sql) => quote(sql, normalizeLines(lines))),
      ),
    place: (tenantId, input) => asResult(() => placeOrder(deps, tenantId, input)),
  };
}

async function placeOrder(
  deps: CheckoutDependencies,
  tenantId: string,
  input: CheckoutInput,
): Promise<CheckoutReceipt> {
  const lines = normalizeLines(input.lines);
  if (
    !uuid.test(input.idempotencyKey) ||
    !Number.isSafeInteger(input.expectedTotal) ||
    input.expectedTotal <= 0 ||
    // `satisfies` runs the check against the concealed value and hands back only a
    // boolean, so validating a buyer does not become a third place the plaintext
    // escapes to.
    !satisfies(input.buyer.phone, (p) => /^\+[1-9]\d{7,14}$/.test(p)) ||
    !satisfies(input.buyer.name, (n) => n.trim().length >= 2 && n.length <= 120) ||
    !satisfies(input.buyer.address, (a) => a.trim().length >= 10 && a.length <= 500) ||
    !['viewer', 'control'].includes(input.cohort)
  )
    throw codedError('ORDER_INVALID_INPUT');
  // Sealed once, up front: the ciphertext and the phone index come from the same
  // values, and doing it here means nothing below this line needs the buyer at all.
  const sealed = deps.sealBuyer(input.buyer, tenantId);
  const phoneHash = sealed.phoneHash;
  if (!(await deps.verifyPhone(input.phoneToken, phoneHash, tenantId)))
    throw codedError('ORDER_PHONE_UNVERIFIED');
  const requestHash = createHash('sha256')
    .update(
      JSON.stringify({
        lines,
        phoneHash,
        total: input.expectedTotal,
        cohort: input.cohort,
        privacyNoticeVersion: input.privacyNoticeVersion ?? null,
      }),
    )
    .digest('hex');
  return deps.database.tenant(tenantId, async (sql) => {
    // Serialize duplicate submissions and orders for one phone before any stock lock.
    await sql.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [
      `${tenantId}:${phoneHash}`,
    ]);
    await sql.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [
      `${tenantId}:${input.idempotencyKey}`,
    ]);
    const existing = (
      await sql.query<{
        id: string;
        reference: string;
        total: number;
        request_hash: string;
      }>('SELECT id,reference,total,request_hash FROM orders WHERE idempotency_key=$1', [
        input.idempotencyKey,
      ])
    ).rows[0];
    if (existing) {
      if (existing.request_hash !== requestHash)
        throw codedError('ORDER_IDEMPOTENCY_CONFLICT');
      return {
        id: existing.id,
        reference: existing.reference,
        total: existing.total,
      };
    }
    const recent = (
      await sql.query<{ count: number }>(
        "SELECT count(*)::int AS count FROM orders WHERE buyer_phone_hash=$1 AND created_at > now()-interval '24 hours'",
        [phoneHash],
      )
    ).rows[0];
    if ((recent?.count ?? 0) >= 3) throw codedError('ORDER_RATE_LIMITED');
    const priced = await quote(sql, lines);
    if (priced.total !== input.expectedTotal) throw codedError('ORDER_TOTAL_MISMATCH');
    const receipt = {
      id: randomUUID(),
      reference: randomBytes(12).toString('hex').toUpperCase(),
      total: priced.total,
    };
    await sql.query(
      `INSERT INTO orders (tenant_id,id,idempotency_key,request_hash,reference,total,buyer_ciphertext,buyer_phone_hash,cohort)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        tenantId,
        receipt.id,
        input.idempotencyKey,
        requestHash,
        receipt.reference,
        receipt.total,
        sealed.ciphertext,
        phoneHash,
        input.cohort,
      ],
    );
    for (const line of priced.lines) {
      await sql.query(
        'UPDATE stock SET quantity=quantity-$1 WHERE garment_id=$2 AND size=$3',
        [line.quantity, line.garmentId, line.size],
      );
      await sql.query('UPDATE garments SET stock_epoch=stock_epoch+1 WHERE id=$1', [
        line.garmentId,
      ]);
      await sql.query(
        'INSERT INTO order_lines (tenant_id,order_id,garment_id,size,quantity,unit_price) VALUES ($1,$2,$3,$4,$5,$6)',
        [tenantId, receipt.id, line.garmentId, line.size, line.quantity, line.unitPrice],
      );
    }
    await sql.query(
      "INSERT INTO audit_log (tenant_id,actor_id,action,entity_id,details) VALUES ($1,'buyer','order.placed',$2,$3)",
      [
        tenantId,
        receipt.id,
        JSON.stringify({
          total: receipt.total,
          itemCount: lines.reduce((n, l) => n + l.quantity, 0),
          ...(input.privacyNoticeVersion
            ? { privacyNoticeVersion: input.privacyNoticeVersion }
            : {}),
        }),
      ],
    );
    return receipt;
  });
}

/** Store phone and origin come from server configuration. Never include buyer PII. */
export function whatsappHandoff(
  storePhone: string,
  storeOrigin: string,
  reference: string,
): string {
  const origin = new URL(storeOrigin);
  if (
    !/^\+[1-9]\d{7,14}$/.test(storePhone) ||
    origin.protocol !== 'https:' ||
    origin.username ||
    origin.password ||
    !/^[A-F0-9]{24}$/.test(reference)
  )
    throw new Error('Invalid handoff configuration');
  const link = new URL(`/orders/${reference}`, origin.origin);
  return `https://wa.me/${storePhone.slice(1)}?text=${encodeURIComponent(`طلب ${reference}\n${link.href}`)}`;
}
