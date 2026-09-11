import { errorCatalog, errorCodeOf, toWireError } from '@talla/errors';
import type { ErrorCode, WireError } from '@talla/errors';
import { TRACE_HEADER } from './trace.ts';

/**
 * The one place a failure becomes an HTTP response.
 *
 * `toWireError` already does the part that matters: an internal code collapses to
 * `INTERNAL_ERROR` carrying the trace id, so the detail reaches the trace and not a
 * screen. This adds the status, the Arabic-first body, and the trace header, and it is
 * the only function that builds a failure response, so there is one thing to check rather
 * than one per route.
 *
 * `WireError` has no field a buyer's name, phone or address could occupy. That is not an
 * accident and it should stay that way: spec 16.5 says PII never appears in an error
 * payload, and a payload with nowhere to put it cannot carry it by mistake.
 */

export function wireErrorFor(code: ErrorCode, traceId: string): WireError {
  return toWireError(code, traceId);
}

export function errorResponse(code: ErrorCode, traceId: string): Response {
  const wire = toWireError(code, traceId);
  return new Response(JSON.stringify(wire), {
    status: wire.http_status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      // A buyer reading a failure can quote this, and it is the only thing that links
      // their screen to the trace. Echoed on failures as well as successes.
      [TRACE_HEADER]: traceId,
      // A failure is never a cached answer.
      'cache-control': 'no-store',
    },
  });
}

/**
 * Turn anything thrown into a response.
 *
 * An unrecognised throw is genuinely internal: a driver failure, or a programmer-error
 * invariant like "a loft needs at least two rings". Neither has copy a buyer should read,
 * and `errorCodeOf` maps both to `INTERNAL_ERROR` rather than guessing.
 */
export function errorResponseFor(thrown: unknown, traceId: string): Response {
  return errorResponse(errorCodeOf(thrown), traceId);
}

/** Status for a code, for callers that build their own response. */
export function statusFor(code: ErrorCode): number {
  return errorCatalog[code].httpStatus;
}
