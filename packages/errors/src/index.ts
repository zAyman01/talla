import { errorCatalog, type ErrorCode } from './catalog.ts';
import type { ErrorEntry, WireError } from './types.ts';

export { errorCatalog } from './catalog.ts';
export type { ErrorCode } from './catalog.ts';
export type { ErrorAudience, Copy, ErrorEntry, WireError } from './types.ts';

/**
 * Build the JSON a client receives. An internal code never reaches a screen: it
 * collapses to INTERNAL_ERROR carrying the trace ID, so the detail goes to the trace
 * rather than to the user (error taxonomy, rule 6).
 *
 * Nothing about the buyer goes in here. Buyer PII never appears in an error payload
 * (spec 16.5), and the way to keep that true is for the payload to have no room for it.
 */
export function toWireError(code: ErrorCode, traceId: string): WireError {
  const entry: ErrorEntry = errorCatalog[code];
  const isInternal = entry.audience === 'internal';
  const shown: ErrorCode = isInternal ? 'INTERNAL_ERROR' : code;
  const shownEntry: ErrorEntry = errorCatalog[shown];

  if (shownEntry.message === undefined || shownEntry.fixAction === undefined) {
    throw new Error(`Error code ${shown} has no user-facing copy`);
  }

  return {
    code: shown,
    http_status: shownEntry.httpStatus,
    user_message: shownEntry.message,
    fix_action: shownEntry.fixAction,
    retryable: shownEntry.retryable,
    trace_id: traceId,
  };
}
