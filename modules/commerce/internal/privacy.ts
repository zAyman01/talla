import type { Database, PrivacyBox } from '@talla/database';

/** Support-operated until owner authentication is integrated. Phone input must be
 * verified by the operator; these functions are never exposed as anonymous routes. */
export async function exportBuyerOrders(
  database: Database,
  privacy: PrivacyBox,
  tenantId: string,
  phone: string,
): Promise<readonly unknown[]> {
  return database.tenant(tenantId, async (sql) => {
    const rows = (
      await sql.query<{
        reference: string;
        total: number;
        status: string;
        buyer_ciphertext: string | null;
      }>(
        'SELECT reference,total,status,buyer_ciphertext FROM orders WHERE buyer_phone_hash=$1',
        [privacy.phoneHash(phone)],
      )
    ).rows;
    return rows.map((row) => ({
      reference: row.reference,
      total: row.total,
      status: row.status,
      buyer: row.buyer_ciphertext ? privacy.open(row.buyer_ciphertext, tenantId) : null,
    }));
  });
}
export async function eraseBuyerContact(
  database: Database,
  privacy: PrivacyBox,
  tenantId: string,
  phone: string,
  actorId: string,
): Promise<number> {
  if (!actorId) throw new Error('AUTH_FORBIDDEN');
  return database.tenant(tenantId, async (sql) => {
    const { rows } = await sql.query<{ id: string }>(
      "UPDATE orders SET buyer_ciphertext=NULL,buyer_phone_hash='deleted:'||id::text,request_hash='deleted:'||id::text WHERE buyer_phone_hash=$1 RETURNING id",
      [privacy.phoneHash(phone)],
    );
    for (const row of rows)
      await sql.query(
        'INSERT INTO audit_log(tenant_id,actor_id,action,entity_id) VALUES($1,$2,$3,$4)',
        [tenantId, actorId, 'buyer.contact_erased', row.id],
      );
    return rows.length;
  });
}
export async function applyRetention(
  database: Database,
  tenantId: string,
  retentionDays: number,
): Promise<number> {
  if (!Number.isSafeInteger(retentionDays) || retentionDays < 1 || retentionDays > 365)
    throw new Error('Invalid retention policy');
  return database.tenant(tenantId, async (sql) => {
    const { rows } = await sql.query<{ id: string }>(
      "UPDATE orders SET buyer_ciphertext=NULL,buyer_phone_hash='deleted:'||id::text,request_hash='deleted:'||id::text WHERE buyer_ciphertext IS NOT NULL AND COALESCE(fulfilled_at,cancelled_at) < now()-($1 * interval '1 day') RETURNING id",
      [retentionDays],
    );
    for (const row of rows)
      await sql.query(
        "INSERT INTO audit_log(tenant_id,actor_id,action,entity_id) VALUES($1,'retention','buyer.contact_erased',$2)",
        [tenantId, row.id],
      );
    return rows.length;
  });
}
