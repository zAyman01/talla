import type { Database, Sql } from '@talla/database';
import { createTenancy } from '@talla/tenancy';
import type { Result, TenantId, TraceId } from '@talla/shared';
import { timed } from '@talla/observability';
import type { Logger } from '@talla/observability';

/**
 * Every storefront query runs through here, and there is no other way in.
 *
 * The buyer is anonymous, so the `Host` header is the only thing that can name a tenant.
 * That is the opposite of admin, which serves every store from one origin and must
 * therefore take its tenant from the signed-in owner's membership instead. A tenant read
 * from a header on that surface would be a tenant chosen by the sender (ADR-0022).
 *
 * A forged host is not a danger here so much as a dead end: `subdomainFromHost` matches
 * only an exact child of the configured parent, an unknown subdomain resolves to nothing,
 * and every query inside runs under `SET LOCAL app.current_tenant` with row-level
 * security forced. Getting the host wrong yields no rows rather than someone else's.
 *
 * This is a factory rather than a bare function because the database and the parent
 * domain come from configuration. The composition root binds it once (Task 8); tests
 * bind it to PGlite.
 */

export interface TenantRequestContext {
  readonly tenantId: TenantId;
  readonly subdomain: string;
  readonly traceId: TraceId;
}

export interface TenantRequestDependencies {
  readonly database: Database;
  /** `TALLA_STOREFRONT_ROOT_DOMAIN`. Tenant subdomains are exact children of it. */
  readonly rootDomain: string;
  readonly logger: Logger;
}

export interface TenantRequests {
  withTenant<T>(
    host: string | null,
    traceId: TraceId,
    work: (sql: Sql, context: TenantRequestContext) => Promise<T>,
  ): Promise<Result<T, 'AUTH_FORBIDDEN'>>;
}

interface TenantRow extends Record<string, unknown> {
  readonly id: string;
  readonly subdomain: string;
  readonly active: boolean;
}

export function createTenantRequests(
  dependencies: TenantRequestDependencies,
): TenantRequests {
  const tenancy = createTenancy(dependencies.rootDomain, {
    /**
     * The registry lookup runs on a platform connection, deliberately outside a tenant
     * transaction, because the tenant is not known yet. It returns routing state only.
     * Row-level security is what makes that safe: with no tenant set, the policy on every
     * tenant-scoped table matches nothing.
     */
    findBySubdomain: (subdomain) =>
      dependencies.database.platform(async (sql) => {
        const { rows } = await sql.query<TenantRow>(
          'SELECT id, subdomain, active FROM tenants WHERE subdomain = $1',
          [subdomain],
        );
        const row = rows[0];
        return row === undefined
          ? undefined
          : { tenantId: row.id, subdomain: row.subdomain, active: row.active };
      }),
    /**
     * Unused on this path. `createTenancy` offers `withContext` for callers that only
     * need the context applied, but the work here needs the connection handle, so the
     * transaction is opened directly through `database.tenant` below.
     */
    runWithTenant: (tenantId, work) => dependencies.database.tenant(tenantId, work),
  });

  return {
    async withTenant(host, traceId, work) {
      const resolved = await tenancy.resolve(host ?? '', traceId);
      // A host that resolves to nothing and a suspended store fail identically. Telling
      // them apart tells an attacker which stores exist (modules/tenancy).
      if (!resolved.ok) return { ok: false, error: 'AUTH_FORBIDDEN' };

      const context: TenantRequestContext = {
        tenantId: resolved.value.tenantId,
        subdomain: resolved.value.subdomain,
        traceId,
      };
      // Bound once per request, so every line the work emits carries the same trace and
      // tenant without anyone remembering to pass them. Timing is a log field: there is
      // no metrics backend, and a duration beside the trace id answers the question this
      // project actually has at nine in the evening.
      const logger = dependencies.logger.child({
        traceId,
        tenantId: context.tenantId,
      });
      const value = await timed(logger, 'tenant.request', () =>
        dependencies.database.tenant(context.tenantId, (sql) => work(sql, context)),
      );
      return { ok: true, value };
    },
  };
}
