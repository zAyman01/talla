import type { Database } from '@talla/database';
import { codedError } from '@talla/errors';

export type OrderState =
  'placed' | 'confirmed' | 'dispatched' | 'fulfilled' | 'cancelled';
const allowed: Readonly<Record<OrderState, readonly OrderState[]>> = {
  placed: ['confirmed', 'cancelled'],
  confirmed: ['dispatched', 'cancelled'],
  dispatched: ['fulfilled'],
  fulfilled: [],
  cancelled: [],
};
/** Caller supplies an authenticated operator ID. Cancellation restores stock exactly
 * once under the order row lock, and all audit writes are in the same transaction. */
export async function transitionOrder(
  database: Database,
  tenantId: string,
  orderId: string,
  next: OrderState,
  actorId: string,
): Promise<void> {
  if (!actorId) throw codedError('AUTH_FORBIDDEN');
  await database.tenant(tenantId, async (sql) => {
    const row = (
      await sql.query<{ status: OrderState }>(
        'SELECT status FROM orders WHERE id=$1 FOR UPDATE',
        [orderId],
      )
    ).rows[0];
    if (!row) throw codedError('AUTH_FORBIDDEN');
    if (row.status === next) return;
    if (!allowed[row.status].includes(next)) throw codedError('ORDER_INVALID_STATE');
    if (next === 'cancelled') {
      const lines = (
        await sql.query<{ garment_id: string; size: string; quantity: number }>(
          'SELECT garment_id,size,quantity FROM order_lines WHERE order_id=$1 ORDER BY garment_id,size',
          [orderId],
        )
      ).rows;
      // Match checkout's garment-before-stock lock order to avoid deadlocks.
      for (const line of lines) {
        await sql.query('UPDATE garments SET stock_epoch=stock_epoch+1 WHERE id=$1', [
          line.garment_id,
        ]);
        await sql.query(
          'UPDATE stock SET quantity=quantity+$1 WHERE garment_id=$2 AND size=$3',
          [line.quantity, line.garment_id, line.size],
        );
      }
    }
    await sql.query(
      "UPDATE orders SET status=$1,fulfilled_at=CASE WHEN $1='fulfilled' THEN now() ELSE fulfilled_at END,cancelled_at=CASE WHEN $1='cancelled' THEN now() ELSE cancelled_at END WHERE id=$2",
      [next, orderId],
    );
    await sql.query(
      'INSERT INTO audit_log(tenant_id,actor_id,action,entity_id,details) VALUES($1,$2,$3,$4,$5)',
      [
        tenantId,
        actorId,
        'order.status_changed',
        orderId,
        JSON.stringify({ from: row.status, to: next }),
      ],
    );
  });
}
