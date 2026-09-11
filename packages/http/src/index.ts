/**
 * Request-edge primitives shared by both applications.
 *
 * These live in a package rather than in either app because the storefront and admin
 * need identical behaviour here, and two copies of a security check drift. Nothing in
 * this file imports Next, so it is testable as plain functions over the standard
 * `Headers` and `Request` types.
 *
 * What this is not: authorization. Next 16's own proxy documentation is explicit that a
 * matcher change can silently remove proxy coverage from a route, and that Server
 * Functions arrive as POSTs to the page they live on. So the checks here are defence in
 * depth, and the real tenant and owner checks happen inside the request, in
 * `server/request.ts`, where no matcher can route around them.
 */

export { NONCE_HEADER, TRACE_HEADER, newTraceId } from './trace.ts';

const SAFE_METHODS: ReadonlySet<string> = new Set(['GET', 'HEAD', 'OPTIONS']);

export function isSafeMethod(method: string): boolean {
  return SAFE_METHODS.has(method.toUpperCase());
}

function hostOf(origin: string): string | undefined {
  try {
    return new URL(origin).host.toLowerCase();
  } catch {
    return undefined;
  }
}

/**
 * Whether a state-changing request came from our own page.
 *
 * With `SameSite=Lax` cookies a cross-site POST does not carry the session anyway, so
 * this is the second lock rather than the first. It costs no token round trip, which is
 * the reason it is here instead of a hidden form field.
 *
 * Hosts are compared, not full origins. Comparing the scheme as well would mean trusting
 * `X-Forwarded-Proto` from whatever sits in front of the app, and a spoofable input is a
 * worse foundation than the host the request was actually routed by. HSTS is what keeps
 * the scheme honest.
 *
 * A missing or opaque `Origin` on a write is refused. Browsers have sent `Origin` on
 * cross-origin writes for years, and a sandboxed iframe sends the literal `null`, which
 * is exactly the case worth refusing.
 */
export function writeIsSameOrigin(
  method: string,
  origin: string | null,
  host: string | null,
): boolean {
  if (isSafeMethod(method)) return true;
  if (origin === null || origin === 'null' || host === null) return false;
  const from = hostOf(origin);
  return from !== undefined && from === host.toLowerCase();
}

/**
 * Content Security Policy, with a per-request nonce.
 *
 * `'strict-dynamic'` means the nonce is what grants trust, and scripts loaded by a
 * trusted script inherit it. That is what lets Next's own chunks load without listing
 * every hash, and it makes a host allowlist irrelevant, which is the point: an allowlist
 * is only as good as the least careful thing on it.
 *
 * **`style-src` needs `'unsafe-inline'`, and that is a real weakness.** `next/font/local`
 * and Next's own style injection emit inline `<style>`, and a nonce does not reach them.
 * It is written here rather than left for a reader to assume it was considered. The
 * condition that closes it is Next supporting nonce-based style handling; until then an
 * injected `style` attribute is not stopped by this policy, and the defences that remain
 * are output encoding and `X-Content-Type-Options`.
 *
 * `frame-ancestors 'none'` will conflict with the Phase 3 Shopify widget, which is an
 * embed by definition. That conflict is expected, and it is one of the reasons spec 22
 * requires the threat model to be re-run before the widget ships.
 */
export function contentSecurityPolicy(nonce: string): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    "connect-src 'self'",
    // The viewer decodes meshes and textures off the main thread.
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    'upgrade-insecure-requests',
  ].join('; ');
}

export interface SecurityHeaderOptions {
  /**
   * Only in production. Sending HSTS from a `http://localhost` development server pins
   * the browser to HTTPS for a host that does not serve it, and the developer who hits
   * that spends an afternoon on it.
   */
  readonly hsts: boolean;
  /** Per-request, from `newTraceId`'s generator. Absent means no policy is sent. */
  readonly nonce?: string | undefined;
}

/**
 * Headers that depend on the request or the environment.
 *
 * The static set (`X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options`,
 * `Permissions-Policy`) stays in `next.config.ts`, because those must reach every
 * response including static assets, and proxy matchers exclude those by design. The
 * split is deliberate: config carries what is constant, this carries what is not.
 *
 * Content Security Policy arrives in Task 8 with the nonce the pages need.
 */
export function securityHeaders(
  options: SecurityHeaderOptions,
): ReadonlyArray<readonly [string, string]> {
  const headers: Array<readonly [string, string]> = [];
  if (options.hsts) {
    // Two years, subdomains included, preload eligible (spec 12.6). Subdomains matter
    // here rather than being boilerplate: every tenant storefront is one.
    headers.push([
      'Strict-Transport-Security',
      'max-age=63072000; includeSubDomains; preload',
    ]);
  }
  if (options.nonce !== undefined) {
    headers.push(['Content-Security-Policy', contentSecurityPolicy(options.nonce)]);
  }
  return headers;
}

export { errorResponse, errorResponseFor, statusFor, wireErrorFor } from './errors.ts';
