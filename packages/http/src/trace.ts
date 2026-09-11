/**
 * The trace header, in its own file so both the edge helpers and the error mapper can
 * import it without the two of them forming a cycle through the package entry point.
 */

/** Emitted on every response and carried into every log line and wire error (spec 16.5). */
export const TRACE_HEADER = 'x-talla-trace';

/** Carries the CSP nonce from the proxy to anything server-rendering a script tag. */
export const NONCE_HEADER = 'x-talla-nonce';

/**
 * A fresh trace id per request.
 *
 * Deliberately not read from an inbound header. Accepting a caller's trace id lets
 * anyone stitch their requests into someone else's trace, or flood the logs with one id
 * to make a session hard to follow. When a CDN edge needs correlation, it gets its own
 * field rather than authority over this one.
 */
export function newTraceId(): string {
  return crypto.randomUUID();
}
