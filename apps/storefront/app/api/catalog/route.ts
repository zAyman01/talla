import { listCatalog } from '@talla/commerce';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { errorResponse, requestContext } from '../../../server/http.ts';
import { getStoreRuntime } from '../../../server/runtime.ts';

export const runtime = 'nodejs';

export async function GET(request: NextRequest): Promise<NextResponse> {
  let traceId: string | undefined;
  try {
    const context = requestContext(request, getStoreRuntime());
    traceId = context.traceId;
    const products = await listCatalog(context.runtime.database, context.store.tenantId);
    return NextResponse.json(
      { store: { name: context.store.name }, products },
      {
        headers: {
          'cache-control': 'public, max-age=15, stale-while-revalidate=30',
          'x-trace-id': traceId,
        },
      },
    );
  } catch (error) {
    return errorResponse(error, traceId);
  }
}
