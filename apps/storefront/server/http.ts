import { randomUUID } from 'node:crypto';
import { errorCatalog, toWireError } from '@talla/errors';
import type { ErrorCode } from '@talla/errors';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import type { StoreConfig, StoreRuntime } from './runtime.ts';

export interface RequestContext {
  readonly traceId: string;
  readonly runtime: StoreRuntime;
  readonly store: StoreConfig;
}

export function requestContext(
  request: NextRequest,
  runtime: StoreRuntime,
): RequestContext {
  const traceId = randomUUID();
  const host = request.headers.get('host') ?? '';
  return { traceId, runtime, store: runtime.storeForHost(host) };
}

export function clientAddress(request: NextRequest): string {
  if (process.env['TALLA_TRUST_PROXY'] !== 'true') return 'untrusted-peer';
  const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  const real = request.headers.get('x-real-ip')?.trim();
  return forwarded || real || 'trusted-proxy-unknown';
}

export async function readJson(request: NextRequest): Promise<unknown> {
  const declared = Number(request.headers.get('content-length') ?? '0');
  if (Number.isFinite(declared) && declared > 16_384)
    throw new Error('ORDER_INVALID_INPUT');
  const body = await request.text();
  if (body.length > 16_384) throw new Error('ORDER_INVALID_INPUT');
  try {
    return JSON.parse(body) as unknown;
  } catch {
    throw new Error('ORDER_INVALID_INPUT');
  }
}

export function stringField(value: unknown, field: string, maximum: number): string {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new Error('ORDER_INVALID_INPUT');
  const result = (value as Record<string, unknown>)[field];
  if (typeof result !== 'string' || result.length > maximum)
    throw new Error('ORDER_INVALID_INPUT');
  return result;
}

export function errorResponse(
  error: unknown,
  traceId: string = randomUUID(),
): NextResponse {
  const message = error instanceof Error ? error.message : '';
  const code: ErrorCode = Object.prototype.hasOwnProperty.call(errorCatalog, message)
    ? (message as ErrorCode)
    : 'INTERNAL_ERROR';
  const wire = toWireError(code, traceId);
  return NextResponse.json(wire, {
    status: wire.http_status,
    headers: { 'cache-control': 'no-store', 'x-trace-id': traceId },
  });
}
