import { Pool } from 'pg';
import type { PoolConfig } from 'pg';
export { createPrivacyBox } from './privacy.ts';
export type { PrivacyBox } from './privacy.ts';

export interface Sql {
  query<T extends Record<string, unknown>>(text: string, values?: unknown[]): Promise<{ rows: T[] }>;
}
export interface Database {
  tenant<T>(tenantId: string, work: (sql: Sql) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Each request owns a connection and transaction. SET LOCAL cannot leak through the pool. */
export async function tenantTransaction<T>(sql: Sql, tenantId: string, work: (connection: Sql) => Promise<T>): Promise<T> {
  if (!uuid.test(tenantId)) throw new Error('Invalid tenant identity');
  await sql.query('BEGIN');
  try {
    await sql.query("SELECT set_config('app.current_tenant', $1, true)", [tenantId]);
    const result = await work(sql);
    await sql.query('COMMIT');
    return result;
  } catch (error) {
    await sql.query('ROLLBACK');
    throw error;
  }
}

export function createDatabase(config: PoolConfig): Database {
  const pool = new Pool({ max: 10, connectionTimeoutMillis: 5000, statement_timeout: 10000, ...config });
  return {
    async tenant<T>(tenantId: string, work: (sql: Sql) => Promise<T>): Promise<T> {
      const client = await pool.connect();
      try {
        const role = await client.query<{ rolsuper: boolean; rolbypassrls: boolean }>('SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user');
        if (role.rows[0]?.rolsuper !== false || role.rows[0].rolbypassrls) throw new Error('Application database role must not bypass RLS');
        return await tenantTransaction(client, tenantId, work);
      } finally { client.release(); }
    },
    close: () => pool.end(),
  };
}
