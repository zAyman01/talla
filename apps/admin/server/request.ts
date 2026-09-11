import type { Database, Sql } from '@talla/database';
import type { OwnerAuth, OwnerMembership, OwnerSession } from '@talla/tenancy';
import type { Result, TenantId, TraceId } from '@talla/shared';
import { timed } from '@talla/observability';
import type { Logger } from '@talla/observability';

/**
 * Every admin query runs through here, and the tenant never comes from a header.
 *
 * This is the half of the design that differs from the storefront, and the difference is
 * the security property (ADR-0022). The storefront reads its tenant from `Host` because a
 * buyer is anonymous and the host is the only thing that can name a store. Admin serves
 * every store from one dedicated origin (spec 12.4), so a tenant read from `Host` there
 * would be a tenant chosen by whoever sent the request.
 *
 * So: the owner comes from the session cookie, the tenant comes from the route, and the
 * pair has to appear in `owner_tenants` or the request fails `AUTH_FORBIDDEN`. That makes
 * the confused-deputy case unreachable rather than guarded against.
 */

export type AdminFailure = 'AUTH_SESSION_EXPIRED' | 'AUTH_FORBIDDEN';

export interface AdminRequestContext {
  readonly tenantId: TenantId;
  readonly ownerId: string;
  readonly role: OwnerMembership['role'];
  readonly traceId: TraceId;
}

export interface AdminRequestDependencies {
  readonly database: Database;
  readonly auth: OwnerAuth;
  readonly logger: Logger;
}

export interface AdminRequests {
  /** Resolve the session alone, for screens that come before a store is chosen. */
  withOwner<T>(
    token: string | undefined,
    traceId: TraceId,
    work: (session: OwnerSession) => Promise<T>,
  ): Promise<Result<T, AdminFailure>>;
  /** Resolve the session, check membership, then open the tenant transaction. */
  withOwnerTenant<T>(
    token: string | undefined,
    tenantId: string,
    traceId: TraceId,
    work: (sql: Sql, context: AdminRequestContext) => Promise<T>,
  ): Promise<Result<T, AdminFailure>>;
}

export function createAdminRequests(
  dependencies: AdminRequestDependencies,
): AdminRequests {
  return {
    async withOwner(token, traceId, work) {
      const session = await dependencies.auth.resolveSession(token ?? '');
      if (!session.ok) return { ok: false, error: 'AUTH_SESSION_EXPIRED' };
      return { ok: true, value: await work(session.value) };
    },

    async withOwnerTenant(token, tenantId, traceId, work) {
      const session = await dependencies.auth.resolveSession(token ?? '');
      if (!session.ok) return { ok: false, error: 'AUTH_SESSION_EXPIRED' };

      // The check that makes a route parameter safe. A tenant the owner does not belong
      // to and a tenant that does not exist fail identically, so the admin origin cannot
      // be used to enumerate which stores are on Talla.
      const membership = await dependencies.auth.authorizeTenant(
        session.value.ownerId,
        tenantId,
      );
      if (!membership.ok) return { ok: false, error: 'AUTH_FORBIDDEN' };

      const context: AdminRequestContext = {
        tenantId: membership.value.tenantId,
        ownerId: session.value.ownerId,
        role: membership.value.role,
        traceId,
      };
      const logger = dependencies.logger.child({
        traceId,
        tenantId: context.tenantId,
        ownerId: context.ownerId,
      });
      const value = await timed(logger, 'admin.request', () =>
        dependencies.database.tenant(context.tenantId, (sql) => work(sql, context)),
      );
      return { ok: true, value };
    },
  };
}

/**
 * Record a privileged action.
 *
 * `audit_log` and its append-only trigger have existed since `001-initial.sql` and
 * nothing had ever written a row. Every admin mutation writes one, inside the same
 * transaction as the change, so an action and its record cannot come apart.
 *
 * `details` carries identifiers and outcomes only. A buyer's name, phone or address never
 * enters it, and the encrypted-at-rest column on `orders` is the only place any of that
 * lives (spec 16.5).
 */
export async function recordAudit(
  sql: Sql,
  context: AdminRequestContext,
  action: string,
  entityId: string,
  details: Readonly<Record<string, string | number | boolean>> = {},
): Promise<void> {
  await sql.query(
    'INSERT INTO audit_log (tenant_id, actor_id, action, entity_id, details) VALUES ($1, $2, $3, $4, $5)',
    [context.tenantId, context.ownerId, action, entityId, JSON.stringify(details)],
  );
}
