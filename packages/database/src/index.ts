/**
 * The runtime data-access surface. The migration runner is deliberately NOT here: it is
 * a tool, it reads the migrations directory from disk, and an application that can import
 * it is an application a bundler will try to trace that directory through. It lives at
 * `@talla/database/migrate`, which also means no request-serving code can reach it.
 */
import { Pool } from 'pg';
import type { PoolConfig } from 'pg';
import type { Sql } from './sql.ts';
export { createPrivacyBox } from './privacy.ts';
export type { PrivacyBox, SealedBuyer, SensitiveBuyer } from './privacy.ts';
export { consumeRateLimit, sweepRateLimits } from './rate-limit.ts';
export type { RateLimitDecision, RateLimitRule } from './rate-limit.ts';
export type { Sql } from './sql.ts';

export interface Database {
  tenant<T>(tenantId: string, work: (sql: Sql) => Promise<T>): Promise<T>;
  /**
   * A transaction with no tenant context, for the handful of tables that are read before
   * a tenant is known: the subdomain registry, and owner identity.
   *
   * This is not a privileged escape hatch, and the reason is worth being precise about.
   * The application role is `NOSUPERUSER NOBYPASSRLS`, and every tenant-scoped table
   * forces row-level security with a policy keyed on `app.current_tenant`. With no tenant
   * set, that policy matches nothing, so a platform connection reads zero rows from
   * `garments`, `orders`, and everything else in that set. `isolation.test.ts` asserts
   * exactly this, and `rls-coverage.test.ts` is what keeps it true for tables added later.
   *
   * So the blast radius of this method is precisely the platform tables, which is the set
   * it exists to reach.
   */
  platform<T>(work: (sql: Sql) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Each request owns a connection and transaction. SET LOCAL cannot leak through the pool. */
export async function tenantTransaction<T>(
  sql: Sql,
  tenantId: string,
  work: (connection: Sql) => Promise<T>,
): Promise<T> {
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

/** A connection whose role could read across tenants makes every policy decorative. */
async function assertConstrainedRole(sql: Sql): Promise<void> {
  const role = await sql.query<{ rolsuper: boolean; rolbypassrls: boolean }>(
    'SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user',
  );
  if (role.rows[0]?.rolsuper !== false || role.rows[0].rolbypassrls)
    throw new Error('Application database role must not bypass RLS');
}

export function createDatabase(config: PoolConfig): Database {
  const pool = new Pool({
    max: 10,
    connectionTimeoutMillis: 5000,
    statement_timeout: 10000,
    ...config,
  });
  return {
    async tenant<T>(tenantId: string, work: (sql: Sql) => Promise<T>): Promise<T> {
      const client = await pool.connect();
      try {
        await assertConstrainedRole(client);
        return await tenantTransaction(client, tenantId, work);
      } finally {
        client.release();
      }
    },
    async platform<T>(work: (sql: Sql) => Promise<T>): Promise<T> {
      const client = await pool.connect();
      try {
        // The same role check as `tenant`, and it matters more here: this path never
        // sets app.current_tenant, so row-level security is the only thing standing
        // between it and every tenant's data.
        await assertConstrainedRole(client);
        await client.query('BEGIN');
        try {
          const result = await work(client);
          await client.query('COMMIT');
          return result;
        } catch (error) {
          await client.query('ROLLBACK');
          throw error;
        }
      } finally {
        client.release();
      }
    },
    close: () => pool.end(),
  };
}
