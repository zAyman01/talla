import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { errorResponse, requestContext } from '../../../server/http.ts';
import { getStoreRuntime } from '../../../server/runtime.ts';

export const runtime = 'nodejs';

export function GET(request: NextRequest): NextResponse {
  let traceId: string | undefined;
  try {
    const context = requestContext(request, getStoreRuntime());
    traceId = context.traceId;
    const existing = request.cookies.get('talla_device')?.value;
    const deviceId =
      existing && /^[a-f0-9-]{36}$/i.test(existing) ? existing : randomUUID();
    const assignment = context.runtime.assignment(context.store.tenantId, deviceId);
    const response = NextResponse.json(
      { cohort: assignment.cohort },
      { headers: { 'cache-control': 'private, no-store', 'x-trace-id': traceId } },
    );
    if (!existing)
      response.cookies.set('talla_device', deviceId, {
        httpOnly: true,
        secure: process.env['NODE_ENV'] === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: 60 * 24 * 60 * 60,
      });
    return response;
  } catch (error) {
    return errorResponse(error, traceId);
  }
}
