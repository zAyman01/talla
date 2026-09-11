import { isSensitive } from '@talla/sensitive';

/**
 * Structured logging, with buyer PII kept out by construction.
 *
 * Spec 16.5 and CLAUDE.md both say buyer PII never appears in a log line, including
 * inside error payloads. Until this package there was no logger for that rule to bind
 * to, so it was a sentence a reviewer had to enforce by noticing, on every change.
 *
 * Three layers, in order of how much they are trusted:
 *
 * 1. **The type.** A log field is a primitive. A `Sensitive<T>` is an object, so it is
 *    not assignable, and `logger.info('order.placed', { phone })` does not compile. This
 *    is the layer that actually does the work (ADR-0020).
 * 2. **The runtime guard.** Values are checked for the wrapper before serialization, in
 *    case one arrives through an `any` or a cast.
 * 3. **The redactor.** The serialized line is scanned for phone-shaped text, because a
 *    plain `string` field can still carry a number somebody typed into a note.
 *
 * Layer 3 firing means layers 1 and 2 have a hole, so under test it throws rather than
 * quietly saving the day. In production it redacts and reports, because an outage is not
 * an improvement on a redacted log line.
 *
 * There is no metrics backend. Timings are log fields. That is what two people can
 * operate, and spec 17 wants the numbers recorded rather than dashboarded.
 */

/** A log field is a primitive. Objects are not accepted, which is what excludes PII. */
export type LogValue = string | number | boolean | null | undefined;
export type LogFields = Readonly<Record<string, LogValue>>;
export type LogLevel = 'info' | 'warn' | 'error';

export interface Logger {
  info(event: string, fields?: LogFields): void;
  warn(event: string, fields?: LogFields): void;
  error(event: string, fields?: LogFields): void;
  /** Bind fields, typically `traceId` and `tenantId`, for the life of a request. */
  child(bound: LogFields): Logger;
}

/**
 * What to do when the redactor finds something the type system should have stopped.
 *
 * `throw` in tests, so a hole fails the build rather than being papered over. `report`
 * in production, where the line is redacted and a separate event records that it
 * happened, carrying no content.
 */
export type RedactionPolicy = 'throw' | 'report';

export interface LoggerOptions {
  readonly sink?: (line: string) => void;
  readonly now?: () => Date;
  readonly policy?: RedactionPolicy;
  readonly bound?: LogFields;
}

/**
 * Recognise identifiers and timestamps as shapes before counting digits.
 *
 * Two false positives got this here, both found by real log lines rather than by
 * imagination:
 *
 * 1. Matching on punctuation alone redacted the `at` field on every line, because
 *    `2026-09-11` is digits and hyphens too.
 * 2. Counting digits fixed that and then mis-read UUIDs. A trace id whose first two
 *    groups happen to be all digits, `12345678-1234-...`, is twelve digits with a
 *    separator, which is indistinguishable from a phone number by counting alone. It
 *    depended on `randomUUID`, so it failed perhaps one run in a few hundred, which is
 *    the worst kind of bug to leave in a gate.
 *
 * So the scanner matches a UUID or an ISO timestamp *first*. Alternation is ordered, so a
 * recognised shape starting at a position wins there and is returned untouched, and only
 * what is left over is weighed as a possible phone number.
 */
const UUID_SOURCE =
  '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}';
const TIMESTAMP_SOURCE = '\\d{4}-\\d{2}-\\d{2}(?:T\\d{2}:\\d{2}:\\d{2}(?:\\.\\d+)?Z?)?';
const DIGIT_RUN_SOURCE = '\\+?\\d[\\d\\s().-]{6,}\\d';
const SCANNER = new RegExp(
  `(${UUID_SOURCE}|${TIMESTAMP_SOURCE})|(${DIGIT_RUN_SOURCE})`,
  'g',
);
const MIN_PHONE_DIGITS = 9;
const MAX_PHONE_DIGITS = 15;
const REDACTED = '[redacted]';

export interface RedactionResult {
  readonly line: string;
  readonly redacted: boolean;
}

export function redact(line: string): RedactionResult {
  const cleaned = line.replaceAll(
    SCANNER,
    (match: string, recognised: string | undefined, candidate: string | undefined) => {
      if (recognised !== undefined || candidate === undefined) return match;
      const digits = candidate.replaceAll(/\D/g, '');
      const plausible =
        digits.length >= MIN_PHONE_DIGITS && digits.length <= MAX_PHONE_DIGITS;
      return plausible ? REDACTED : match;
    },
  );
  return { line: cleaned, redacted: cleaned !== line };
}

function defaultPolicy(): RedactionPolicy {
  return process.env['NODE_ENV'] === 'test' ? 'throw' : 'report';
}

export function createLogger(options: LoggerOptions = {}): Logger {
  const sink =
    options.sink ??
    ((line: string): void => {
      process.stdout.write(`${line}\n`);
    });
  const now = options.now ?? ((): Date => new Date());
  const policy = options.policy ?? defaultPolicy();
  const bound = options.bound ?? {};

  function write(level: LogLevel, event: string, fields: LogFields): void {
    const merged: Record<string, LogValue> = { ...bound };
    for (const [key, value] of Object.entries(fields)) {
      if (isSensitive(value)) {
        // Reachable only through an `any` or a cast, because the type refuses it. Naming
        // the field is safe; printing it is the thing being prevented.
        throw new Error(`Log field ${key} carries a concealed value`);
      }
      merged[key] = value;
    }

    const record = { level, event, at: now().toISOString(), ...merged };
    const { line, redacted } = redact(JSON.stringify(record));

    if (redacted) {
      if (policy === 'throw') {
        throw new Error(
          `Log event ${event} contained phone-shaped text. A field is carrying PII that the type system did not catch.`,
        );
      }
      // Reported without the offending content, so the report is not the leak.
      sink(
        JSON.stringify({
          level: 'error',
          event: 'observability.redaction',
          at: now().toISOString(),
          redactedEvent: event,
        }),
      );
    }
    sink(line);
  }

  const logger: Logger = {
    info: (event, fields = {}) => {
      write('info', event, fields);
    },
    warn: (event, fields = {}) => {
      write('warn', event, fields);
    },
    error: (event, fields = {}) => {
      write('error', event, fields);
    },
    child: (extra) => createLogger({ ...options, bound: { ...bound, ...extra } }),
  };
  return logger;
}

/**
 * Run work and log how long it took.
 *
 * Timing is a log field rather than a metric because there is no metrics backend and
 * adding one is not free to operate. A duration in the same line as the trace id answers
 * "what happened to order 4412 at nine in the evening", which is the question this
 * project actually has.
 */
export async function timed<T>(
  logger: Logger,
  event: string,
  work: () => Promise<T>,
  fields: LogFields = {},
): Promise<T> {
  const started = Date.now();
  try {
    const result = await work();
    logger.info(event, { ...fields, durationMs: Date.now() - started, outcome: 'ok' });
    return result;
  } catch (error) {
    logger.error(event, {
      ...fields,
      durationMs: Date.now() - started,
      outcome: 'failed',
      // The class of failure, never its message: an exception message is the most common
      // way a buyer's address reaches a log line.
      errorName: error instanceof Error ? error.name : 'unknown',
    });
    throw error;
  }
}
