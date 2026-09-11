/**
 * Values that must never reach a log line.
 *
 * Spec 16.5 and CLAUDE.md both say buyer PII never appears in a log line, including
 * inside error payloads. That rule needs something to bind to, because a rule enforced by
 * remembering is a rule that survives until the first tired evening.
 *
 * A brand does not work. `string & { __sensitive: true }` is still assignable to `string`,
 * so a branded phone number logs cleanly and the compiler says nothing at all. The value
 * has to stop being a string.
 *
 * So a sensitive value is an opaque object. It is not assignable to the logger's field
 * type, so `logger.info('order.placed', { phone })` does not compile. Reading it back
 * requires `reveal`, which is greppable, and which has exactly two legitimate call sites.
 *
 * What this is not: a capability boundary. `Object.getOwnPropertySymbols` will find the
 * accessor, and anyone determined to leak a phone number can. It stops the accident, which
 * is the failure mode that actually happens.
 */

/**
 * Module private on purpose. Nothing outside this file can name it, so nothing outside
 * this file can read the value without going through `reveal`.
 */
const ACCESS: unique symbol = Symbol('talla.sensitive.access');

export interface Sensitive<T> {
  readonly [ACCESS]: () => T;
  /** `JSON.stringify` of any containing object yields the placeholder, not the value. */
  toJSON: () => string;
  /** Template interpolation yields the placeholder rather than `[object Object]`. */
  toString: () => string;
}

const PLACEHOLDER = '[sensitive]';

export function conceal<T>(inner: T): Sensitive<T> {
  return {
    [ACCESS]: () => inner,
    toJSON: () => PLACEHOLDER,
    toString: () => PLACEHOLDER,
  };
}

/**
 * Read the value back.
 *
 * Two legitimate call sites, and a third that is a bug:
 *
 * - `packages/database/src/privacy.ts`, sealing and opening a buyer record.
 * - The OTP delivery adapter, handing a phone number to the carrier.
 * - Anywhere else. If a new call site is needed, the question to answer first is why the
 *   value is leaving the two places that are allowed to see it.
 */
export function reveal<T>(value: Sensitive<T>): T {
  return value[ACCESS]();
}

/** True for anything produced by `conceal`. Used by the logger's runtime guard. */
export function isSensitive(value: unknown): value is Sensitive<unknown> {
  return typeof value === 'object' && value !== null && ACCESS in value;
}

/**
 * Test a concealed value without taking it out.
 *
 * Validation needs the plaintext: a phone number has to be matched against a pattern and
 * an address has to be measured. Doing that with `reveal` would make every validating
 * function a third place the value escapes to, and the list of legitimate call sites is
 * the only thing keeping `reveal` meaningful.
 *
 * The predicate does see the value, so this is friction rather than a capability
 * boundary, the same caveat ADR-0020 records for the wrapper itself. What it does buy is
 * that the *result* is a boolean: there is nothing here to accidentally log, pass on, or
 * put in an error message.
 */
export function satisfies<T>(
  value: Sensitive<T>,
  predicate: (inner: T) => boolean,
): boolean {
  return predicate(value[ACCESS]());
}
