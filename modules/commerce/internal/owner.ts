import type { Database, PrivacyBox } from '@talla/database';

type OrderStatus = 'placed' | 'confirmed' | 'dispatched' | 'fulfilled' | 'cancelled';
type GarmentStatus = 'ready' | 'archived';

export interface OwnerOrder {
  readonly id: string;
  readonly reference: string;
  readonly total: number;
  readonly status: OrderStatus;
  readonly createdAt: string;
  readonly buyer: {
    readonly name: string;
    readonly phone: string;
    readonly address: string;
  };
  readonly lines: readonly {
    readonly name: string;
    readonly size: string;
    readonly quantity: number;
  }[];
}

export interface InventoryItem {
  readonly id: string;
  readonly name: string;
  readonly price: number;
  readonly status: string;
  readonly stock: Readonly<Record<string, number>>;
}

function buyer(value: unknown): OwnerOrder['buyer'] {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new Error('INTERNAL_ERROR');
  const record = value as Record<string, unknown>;
  if (
    typeof record['name'] !== 'string' ||
    typeof record['phone'] !== 'string' ||
    typeof record['address'] !== 'string'
  )
    throw new Error('INTERNAL_ERROR');
  return { name: record['name'], phone: record['phone'], address: record['address'] };
}

export async function listOwnerOrders(
  database: Database,
  privacy: PrivacyBox,
  tenantId: string,
): Promise<readonly OwnerOrder[]> {
  return database.tenant(tenantId, async (sql) => {
    const orders = (
      await sql.query<{
        id: string;
        reference: string;
        total: number;
        status: OrderStatus;
        created_at: Date | string;
        buyer_ciphertext: string | null;
      }>(
        `SELECT id,reference,total,status,created_at,buyer_ciphertext
         FROM orders ORDER BY created_at DESC LIMIT 100`,
      )
    ).rows;
    const result: OwnerOrder[] = [];
    for (const order of orders) {
      if (!order.buyer_ciphertext) continue;
      const lines = (
        await sql.query<{ name: string; size: string; quantity: number }>(
          `SELECT g.name_ar AS name,l.size,l.quantity
           FROM order_lines l JOIN garments g ON g.id=l.garment_id AND g.tenant_id=l.tenant_id
           WHERE l.order_id=$1 ORDER BY g.name_ar,l.size`,
          [order.id],
        )
      ).rows;
      result.push({
        id: order.id,
        reference: order.reference,
        total: order.total,
        status: order.status,
        createdAt: new Date(order.created_at).toISOString(),
        buyer: buyer(privacy.open(order.buyer_ciphertext, tenantId)),
        lines,
      });
    }
    return result;
  });
}

export async function listInventory(
  database: Database,
  tenantId: string,
): Promise<readonly InventoryItem[]> {
  return database.tenant(tenantId, async (sql) => {
    const rows = (
      await sql.query<{
        id: string;
        name: string;
        price: number;
        status: string;
        stock: unknown;
      }>(
        `SELECT g.id,g.name_ar AS name,g.price,g.status,
          COALESCE(jsonb_object_agg(s.size,s.quantity) FILTER (WHERE s.size IS NOT NULL),'{}') AS stock
         FROM garments g LEFT JOIN stock s ON s.garment_id=g.id AND s.tenant_id=g.tenant_id
         GROUP BY g.id,g.name_ar,g.price,g.status,g.created_at ORDER BY g.created_at,g.id`,
      )
    ).rows;
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      price: row.price,
      status: row.status,
      stock:
        typeof row.stock === 'object' && row.stock !== null && !Array.isArray(row.stock)
          ? (row.stock as Record<string, number>)
          : {},
    }));
  });
}

export async function updateInventory(
  database: Database,
  tenantId: string,
  garmentId: string,
  input: {
    readonly price: number;
    readonly status: GarmentStatus;
    readonly stock: Readonly<Record<string, number>>;
  },
  actorId: string,
): Promise<void> {
  const sizeNames = ['XS', 'S', 'M', 'L', 'XL', 'XXL'] as const;
  if (
    !/^[0-9a-f-]{36}$/i.test(garmentId) ||
    !Number.isSafeInteger(input.price) ||
    input.price < 1 ||
    input.price > 2_147_483_647 ||
    !['ready', 'archived'].includes(input.status) ||
    !actorId
  )
    throw new Error('ORDER_INVALID_INPUT');
  for (const [size, quantity] of Object.entries(input.stock))
    if (
      !sizeNames.includes(size as (typeof sizeNames)[number]) ||
      !Number.isSafeInteger(quantity) ||
      quantity < 0 ||
      quantity > 100_000
    )
      throw new Error('ORDER_INVALID_INPUT');
  await database.tenant(tenantId, async (sql) => {
    const existing = (
      await sql.query<{ status: string }>(
        'SELECT status FROM garments WHERE id=$1 FOR UPDATE',
        [garmentId],
      )
    ).rows[0];
    if (!existing || !['ready', 'archived'].includes(existing.status))
      throw new Error('AUTH_FORBIDDEN');
    await sql.query(
      'UPDATE garments SET price=$1,status=$2,stock_epoch=stock_epoch+1 WHERE id=$3',
      [input.price, input.status, garmentId],
    );
    for (const [size, quantity] of Object.entries(input.stock))
      await sql.query(
        `INSERT INTO stock(tenant_id,garment_id,size,quantity) VALUES($1,$2,$3,$4)
         ON CONFLICT(tenant_id,garment_id,size) DO UPDATE SET quantity=EXCLUDED.quantity`,
        [tenantId, garmentId, size, quantity],
      );
    await sql.query(
      `INSERT INTO audit_log(tenant_id,actor_id,action,entity_id,details)
       VALUES($1,$2,'inventory.updated',$3,$4)`,
      [
        tenantId,
        actorId,
        garmentId,
        JSON.stringify({ price: input.price, status: input.status, stock: input.stock }),
      ],
    );
  });
}
