import type { Database } from '@talla/database';

export interface PublicOrderSummary {
  readonly reference: string;
  readonly total: number;
  readonly status: 'placed' | 'confirmed' | 'dispatched' | 'fulfilled' | 'cancelled';
  readonly createdAt: string;
  readonly lines: readonly {
    readonly name: string;
    readonly size: string;
    readonly quantity: number;
  }[];
}

const referencePattern = /^[A-F0-9]{24}$/;

/** Public order links carry 96 random bits and expose no buyer contact data. */
export async function getOrderSummary(
  database: Database,
  tenantId: string,
  reference: string,
): Promise<PublicOrderSummary | undefined> {
  if (!referencePattern.test(reference)) return undefined;
  return database.tenant(tenantId, async (sql) => {
    const order = (
      await sql.query<{
        id: string;
        reference: string;
        total: number;
        status: PublicOrderSummary['status'];
        created_at: Date | string;
      }>('SELECT id,reference,total,status,created_at FROM orders WHERE reference=$1', [
        reference,
      ])
    ).rows[0];
    if (!order) return undefined;
    const lines = (
      await sql.query<{ name: string; size: string; quantity: number }>(
        `SELECT g.name_ar AS name,l.size,l.quantity
         FROM order_lines l JOIN garments g ON g.id=l.garment_id AND g.tenant_id=l.tenant_id
         WHERE l.order_id=$1 ORDER BY g.name_ar,l.size`,
        [order.id],
      )
    ).rows;
    return {
      reference: order.reference,
      total: order.total,
      status: order.status,
      createdAt: new Date(order.created_at).toISOString(),
      lines,
    };
  });
}
