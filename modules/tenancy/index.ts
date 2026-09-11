import type { Result, TenantId, TraceId } from '@talla/shared';

/**
 * One store per tenant: subdomain, theme, isolated data, and the tenant context every
 * query runs under.
 *
 * Guarantee to callers: the context is set once per request, before any query. Isolation
 * is enforced by row-level security in the database, not by this module remembering to
 * add a WHERE clause (ADR-0002, spec 12.3).
 */

export interface TenantContext {
  readonly tenantId: TenantId;
  readonly subdomain: string;
  readonly traceId: TraceId;
}

/**
 * A host that resolves to no tenant and a host whose tenant is suspended fail the same
 * way. A response that distinguishes them tells an attacker which stores exist.
 */
export type TenantResolution = 'AUTH_FORBIDDEN';

export interface Tenancy {
  resolve(
    host: string,
    traceId: TraceId,
  ): Promise<Result<TenantContext, TenantResolution>>;
  /**
   * Run work with the tenant context applied to the connection for its whole duration.
   * Every query inside runs under the row-level security policy for that tenant.
   */
  withContext<T>(context: TenantContext, work: () => Promise<T>): Promise<T>;
}

export interface TenantRecord {
  readonly tenantId: TenantId;
  readonly subdomain: string;
  readonly active: boolean;
}

export interface TenancyDependencies {
  /** The platform registry lookup is deliberately outside a tenant transaction: the
   * tenant is not known yet. Return only public routing state from this adapter. */
  findBySubdomain(subdomain: string): Promise<TenantRecord | undefined>;
  runWithTenant<T>(tenantId: TenantId, work: () => Promise<T>): Promise<T>;
}

export { createTenancy, subdomainFromHost } from './internal/resolve.ts';

/**
 * Owner authentication lives here rather than in a module of its own because the thing
 * it produces is the right to act as a tenant. `owner_tenants` is the membership join
 * that answers "which tenant may this person become", which is the same question
 * `resolve` answers from a host header, asked by a different surface (ADR-0022).
 */
export { createOwnerAuth } from './internal/owner.ts';
export type {
  AuthFailure,
  CompletedLogin,
  OwnerAuth,
  OwnerAuthDependencies,
  OwnerMembership,
  OwnerSession,
  StartedLogin,
} from './internal/owner.ts';
