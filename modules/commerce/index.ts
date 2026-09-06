import type { GarmentId, Result, TenantId, TraceId } from '@talla/shared';
import type { TenantContext } from '@talla/tenancy';

/**
 * Catalog, cart, orders, cash on delivery.
 *
 * Guarantee to callers: price and stock are server authoritative. The client never
 * sends a price, and totals are recomputed at submission (spec 12.5). Nothing in this
 * interface accepts one.
 */

/** Piastres, integer. Floating point money is a rounding bug waiting for a deadline. */
export type Piastres = number;

export type Size = 'XS' | 'S' | 'M' | 'L' | 'XL' | 'XXL';

export interface CatalogItem {
  readonly garmentId: GarmentId;
  readonly tenantId: TenantId;
  readonly price: Piastres;
  readonly sizesInStock: readonly Size[];
}

/** What the client may send: what, which size, how many. Never what it costs. */
export interface CartLineInput {
  readonly garmentId: GarmentId;
  readonly size: Size;
  readonly quantity: number;
}

export interface PricedCart {
  readonly lines: ReadonlyArray<CartLineInput & { readonly unitPrice: Piastres }>;
  readonly total: Piastres;
}

export interface OrderInput {
  readonly lines: readonly CartLineInput[];
  /** Verified by OTP before an order is accepted (ADR-0007). */
  readonly buyerPhoneToken: string;
  readonly deliveryNote: string;
}

export interface Order {
  readonly id: string;
  readonly total: Piastres;
  readonly placedAt: string;
}

export type CommerceFailure =
  | 'STOCK_UNAVAILABLE'
  | 'STOCK_INSUFFICIENT'
  | 'ORDER_PHONE_UNVERIFIED'
  | 'ORDER_TOTAL_MISMATCH';

export interface Commerce {
  price(context: TenantContext, lines: readonly CartLineInput[]): Promise<PricedCart>;
  /**
   * `expectedTotal` is what the buyer was shown. A mismatch shows the new total rather
   * than silently charging either one.
   */
  placeOrder(
    context: TenantContext,
    input: OrderInput,
    expectedTotal: Piastres,
    traceId: TraceId,
  ): Promise<Result<Order, CommerceFailure>>;
}
