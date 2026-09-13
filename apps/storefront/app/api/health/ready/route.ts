import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { errorResponse, requestContext } from '../../../../server/http.ts';
import { getStoreRuntime } from '../../../../server/runtime.ts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest): Promise<NextResponse> {
  let traceId: string | undefined;
  try {
    const context = requestContext(request, getStoreRuntime());
    traceId = context.traceId;
    await context.runtime.database.tenant(context.store.tenantId, (sql) =>
      sql.query('SELECT 1'),
    );
    return NextResponse.json(
      { ready: true },
      { headers: { 'cache-control': 'no-store', 'x-trace-id': traceId } },
    );
  } catch (error) {
    return errorResponse(error, traceId);
  }
}
