import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import {
  NONCE_HEADER,
  TRACE_HEADER,
  newTraceId,
  securityHeaders,
  writeIsSameOrigin,
} from '@talla/http';

/**
 * Named `proxy`, not `middleware`: Next 16 renamed the convention, and the file has to
 * match or it silently never runs.
 *
 * This does only what is safe with no database call. Next's own documentation warns that
 * a matcher change can remove proxy coverage from a route without anyone noticing, and
 * that Server Functions arrive as POSTs to the page they live on. So nothing here is
 * load bearing for authorization: the tenant check lives in `server/request.ts`, inside
 * the request, where no matcher can route around it.
 */

export function proxy(request: NextRequest): NextResponse {
  const origin = request.headers.get('origin');
  const host = request.headers.get('host');

  if (!writeIsSameOrigin(request.method, origin, host)) {
    // A cross-site write. With SameSite=Lax the session cookie would not have come along
    // anyway, so this is the second lock, and it costs no token round trip.
    return new NextResponse(null, { status: 403 });
  }

  const traceId = newTraceId();
  // Next reads the nonce back off the CSP header it is given and stamps its own script
  // tags with it, so this one value has to reach both the request and the response.
  const nonce = Buffer.from(newTraceId()).toString('base64');
  const headers = new Headers(request.headers);
  headers.set(TRACE_HEADER, traceId);
  headers.set(NONCE_HEADER, nonce);

  const response = NextResponse.next({ request: { headers } });
  response.headers.set(TRACE_HEADER, traceId);
  for (const [name, value] of securityHeaders({
    hsts: process.env.NODE_ENV === 'production',
    nonce,
  })) {
    response.headers.set(name, value);
  }
  return response;
}

export const config = {
  matcher: [
    /**
     * Everything except Next's own build output, which is immutable and content hashed.
     *
     * Files under `public/` are deliberately **not** excluded, even though they are
     * static. HSTS belongs on every response, not only on HTML: a browser that has been
     * told about HSTS by a page but not by an image has a window where an asset request
     * can still leave over plain HTTP, and buyers are on café wi-fi (spec 12.6). The cost
     * is one generated id per asset, and in production these come from the CDN by content
     * hash (ADR-0009) rather than from this server at all.
     */
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
