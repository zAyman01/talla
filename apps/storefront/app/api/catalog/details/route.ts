import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { TRACE_HEADER } from '@talla/http';
import { container } from '../../../../server/container.ts';
import { errorResponse } from '../../../../server/http.ts';
import { readCatalog } from '../../../../server/catalog.ts';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest): Promise<NextResponse> {
  const traceId = request.headers.get(TRACE_HEADER) ?? randomUUID();
  try {
    const id = request.nextUrl.searchParams.get('id');
    if (!id || id.length > 100)
      return errorResponse(new Error('ORDER_INVALID_INPUT'), traceId);

    const result = await container().requests.withTenant(
      request.headers.get('host'),
      traceId,
      async (sql) => (await readCatalog(sql)).find((product) => product.id === id),
    );
    if (!result.ok) return errorResponse(new Error(result.error), traceId);
    if (!result.value) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', trace_id: traceId } },
        { status: 404, headers: { 'cache-control': 'no-store', 'x-trace-id': traceId } },
      );
    }
    return NextResponse.json(
      { product: result.value },
      {
        headers: {
          'cache-control': 'private, max-age=60',
          'x-trace-id': traceId,
        },
      },
    );
  } catch (error) {
    return errorResponse(error, traceId);
  }
}
