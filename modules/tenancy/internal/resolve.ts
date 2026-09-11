import type { Result, TenantId, TraceId } from '@talla/shared';

interface ResolvedTenant {
  readonly tenantId: TenantId;
  readonly subdomain: string;
  readonly active: boolean;
}

interface ResolverDependencies {
  findBySubdomain(subdomain: string): Promise<ResolvedTenant | undefined>;
  runWithTenant<T>(tenantId: TenantId, work: () => Promise<T>): Promise<T>;
}

interface ResolvedContext {
  readonly tenantId: TenantId;
  readonly subdomain: string;
  readonly traceId: TraceId;
}

interface ResolvedTenancy {
  resolve(
    host: string,
    traceId: TraceId,
  ): Promise<Result<ResolvedContext, 'AUTH_FORBIDDEN'>>;
  withContext<T>(context: ResolvedContext, work: () => Promise<T>): Promise<T>;
}

const label = /^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/;

/** Resolve only an exact child of the configured parent. A suffix match would accept
 * `store.talla.app.attacker.example` and route it as a real tenant. */
export function subdomainFromHost(
  host: string,
  parentDomain: string,
): string | undefined {
  const normalizedHost = host.trim().toLowerCase().replace(/\.$/, '');
  const normalizedParent = parentDomain.trim().toLowerCase().replace(/^\./, '');
  if (!normalizedHost || !normalizedParent || normalizedHost.includes('/'))
    return undefined;

  let hostname: string;
  let parent: string;
  try {
    hostname = new URL(`http://${normalizedHost}`).hostname;
    // The parent is parsed the same way as the host, so a port on either side drops out
    // before the comparison. Development runs on `localhost:3000` and the port is not
    // part of what makes a host a child of a domain, so requiring the two spellings to
    // agree would only mean every store resolving to nothing on a developer's machine.
    parent = new URL(`http://${normalizedParent}`).hostname;
  } catch {
    return undefined;
  }
  const suffix = `.${parent}`;
  if (!hostname.endsWith(suffix)) return undefined;
  const candidate = hostname.slice(0, -suffix.length);
  if (!label.test(candidate) || candidate.includes('.')) return undefined;
  return candidate;
}

export function createTenancy(
  parentDomain: string,
  dependencies: ResolverDependencies,
): ResolvedTenancy {
  if (!parentDomain.trim()) throw new Error('Invalid parent domain');
  return {
    async resolve(host: string, traceId: TraceId) {
      const subdomain = subdomainFromHost(host, parentDomain);
      if (!subdomain || !traceId.trim()) return { ok: false, error: 'AUTH_FORBIDDEN' };
      const tenant = await dependencies.findBySubdomain(subdomain);
      if (!tenant || !tenant.active || tenant.subdomain !== subdomain)
        return { ok: false, error: 'AUTH_FORBIDDEN' };
      const context: ResolvedContext = {
        tenantId: tenant.tenantId,
        subdomain,
        traceId,
      };
      return { ok: true, value: context };
    },
    withContext: (context, work) => dependencies.runWithTenant(context.tenantId, work),
  };
}
