import { conceal } from '@talla/sensitive';
import { errorResponse, errorResponseFor, TRACE_HEADER } from '@talla/http';
import type { ErrorCode } from '@talla/errors';
import { container } from './container.ts';

/**
 * The shared shape of every buyer-facing route.
 *
 * One helper resolves the tenant, carries the trace id, and turns any failure into a
 * taxonomy response. Doing it once is what keeps a route from inventing its own error
 * shape, and it is why `WireError` is the only thing a buyer ever receives.
 */

export interface RouteOutcome<T> {
  readonly status: number;
  readonly body: T;
}

function traceOf(request: Request): string {
  // The proxy mints one per request and sets it on the inbound headers.
  return request.headers.get(TRACE_HEADER) ?? 'untraced';
}

function ok(body: unknown, traceId: string): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      [TRACE_HEADER]: traceId,
      // A cart total is specific to one buyer at one instant. Never a cached answer.
      'cache-control': 'no-store',
    },
  });
}

async function body(request: Request): Promise<Record<string, unknown>> {
  try {
    const parsed: unknown = await request.json();
    return typeof parsed === 'object' && parsed !== null
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function text(source: Record<string, unknown>, name: string): string {
  const value = source[name];
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * Runs work under the tenant the host names, and answers a failure with its code.
 *
 * An unrecognised throw becomes `INTERNAL_ERROR` carrying the trace id, so a driver
 * failure reaches the trace rather than the buyer's screen.
 */
async function withStore<T>(
  request: Request,
  work: (input: {
    readonly json: Record<string, unknown>;
    readonly tenantId: string;
    readonly traceId: string;
  }) => Promise<RouteOutcome<T> | ErrorCode>,
): Promise<Response> {
  const traceId = traceOf(request);
  const { requests, logger } = container();
  try {
    const json = await body(request);
    const result = await requests.withTenant(
      request.headers.get('host'),
      traceId,
      async (_sql, context) => work({ json, tenantId: context.tenantId, traceId }),
    );
    if (!result.ok) return errorResponse('AUTH_FORBIDDEN', traceId);
    if (typeof result.value === 'string') return errorResponse(result.value, traceId);
    return ok(result.value.body, traceId);
  } catch (thrown) {
    logger.error('route.failed', {
      traceId,
      errorName: thrown instanceof Error ? thrown.name : 'unknown',
    });
    return errorResponseFor(thrown, traceId);
  }
}

interface LineInput {
  readonly garmentId: string;
  readonly size: 'XS' | 'S' | 'M' | 'L' | 'XL' | 'XXL';
  readonly quantity: number;
}

/**
 * Lines as the client may send them: what, which size, how many.
 *
 * Never a price. Spec 12.5 puts price authority on the server, and the way to keep that
 * true is for the parser to have nowhere to put one.
 */
function linesFrom(json: Record<string, unknown>): readonly LineInput[] {
  const raw = json['lines'];
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((entry): LineInput[] => {
    if (typeof entry !== 'object' || entry === null) return [];
    const line = entry as Record<string, unknown>;
    const garmentId = line['garmentId'];
    const size = line['size'];
    const quantity = line['quantity'];
    if (
      typeof garmentId !== 'string' ||
      typeof size !== 'string' ||
      typeof quantity !== 'number'
    ) {
      return [];
    }
    return [{ garmentId, size: size as LineInput['size'], quantity }];
  });
}

export function quoteRoute(request: Request): Promise<Response> {
  return withStore(request, async ({ json, tenantId }) => {
    const { checkout } = container();
    const priced = await checkout.quote(tenantId, linesFrom(json));
    return priced.ok
      ? { status: 200, body: { total: priced.value.total, lines: priced.value.lines } }
      : priced.error;
  });
}

export function challengeRoute(request: Request): Promise<Response> {
  return withStore(request, async ({ json, tenantId }) => {
    const { phone } = container();
    const started = await phone.start(
      tenantId,
      text(json, 'phone'),
      // Hashed before storage, never written down (modules/commerce).
      request.headers.get('x-forwarded-for') ?? '0.0.0.0',
    );
    return { status: 200, body: started };
  });
}

export function verifyRoute(request: Request): Promise<Response> {
  return withStore(request, async ({ json, tenantId }) => {
    const { phone } = container();
    const verified = await phone.verify(
      tenantId,
      text(json, 'challengeId'),
      text(json, 'phone'),
      text(json, 'code'),
    );
    return { status: 200, body: verified };
  });
}

export function orderRoute(request: Request): Promise<Response> {
  return withStore(request, async ({ json, tenantId }) => {
    const { checkout } = container();
    const expectedTotal = json['expectedTotal'];
    if (typeof expectedTotal !== 'number') return 'ORDER_INVALID_INPUT';

    const placed = await checkout.place(tenantId, {
      idempotencyKey: text(json, 'idempotencyKey'),
      lines: linesFrom(json),
      // What the buyer was shown. A mismatch shows the new total rather than silently
      // charging either one (spec 12.5).
      expectedTotal,
      buyer: {
        // Concealed the moment it crosses the boundary, so nothing downstream holds a
        // plaintext name, number or address (ADR-0020).
        name: conceal(text(json, 'name')),
        phone: conceal(text(json, 'phone')),
        address: conceal(text(json, 'address')),
      },
      phoneToken: text(json, 'phoneToken'),
      cohort: json['cohort'] === 'control' ? 'control' : 'viewer',
    });

    return placed.ok
      ? {
          status: 200,
          body: { reference: placed.value.reference, total: placed.value.total },
        }
      : placed.error;
  });
}

/** Liveness. No database call: this answers whether the process is up, nothing else. */
export function healthRoute(): Response {
  return new Response(JSON.stringify({ status: 'ok' }), {
    status: 200,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}

/**
 * Readiness. Pings the database, because a process that cannot reach PostgreSQL can
 * serve nothing and should be taken out of rotation rather than left to fail requests.
 */
export async function readyRoute(): Promise<Response> {
  const { database, logger } = container();
  try {
    await database.platform(async (sql) => {
      await sql.query('SELECT 1');
    });
    return new Response(JSON.stringify({ status: 'ready' }), {
      status: 200,
      headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
    });
  } catch (thrown) {
    logger.error('ready.failed', {
      errorName: thrown instanceof Error ? thrown.name : 'unknown',
    });
    return new Response(JSON.stringify({ status: 'unavailable' }), {
      status: 503,
      headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
    });
  }
}
