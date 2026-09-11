import { errorCatalog, type ErrorCode } from './catalog.ts';

/**
 * A thrown failure that carries a taxonomy code.
 *
 * Spec 16.5 says a failure carries a code, never a free-text string. Most of this
 * repository returns `Result` for that reason. Throwing still has one job that returning
 * cannot do: work inside `database.tenant` must throw to roll the transaction back, so a
 * failure discovered halfway through an order has to unwind before it becomes a `Result`.
 *
 * `throw new Error('ORDER_TOTAL_MISMATCH')` did that job by putting the code in the
 * message, which is exactly the free-text string the spec forbids: nothing checks it,
 * a typo is invisible, and `error.message` is matched with `toThrow('IDEMPOTENCY')`
 * substring tests that pass for the wrong reason.
 *
 * This keeps the throw, and makes the code a checked property.
 *
 * A plain `Error` still means what it always meant: a programmer error. "A loft needs at
 * least two rings" is a bug in the caller, not something a buyer can be told about, and
 * it must not acquire a code.
 */

export interface CodedError extends Error {
  readonly code: ErrorCode;
}

export function codedError(code: ErrorCode, options?: { cause?: unknown }): CodedError {
  // The message is the code, so an uncaught one is still readable in a stack trace. The
  // `code` property is what anything programmatic reads.
  const error = new Error(code, options) as Error & { code: ErrorCode };
  error.name = 'CodedError';
  error.code = code;
  return error;
}

export function isCodedError(value: unknown): value is CodedError {
  return (
    value instanceof Error &&
    'code' in value &&
    typeof (value as { code: unknown }).code === 'string' &&
    Object.hasOwn(errorCatalog, (value as { code: string }).code)
  );
}

/**
 * The code carried by a thrown value, or `INTERNAL_ERROR` for anything else.
 *
 * An unrecognised throw is genuinely internal: it is a bug, a driver failure, or a
 * programmer-error invariant, and none of those has copy a buyer should read.
 */
export function errorCodeOf(value: unknown): ErrorCode {
  return isCodedError(value) ? value.code : 'INTERNAL_ERROR';
}
