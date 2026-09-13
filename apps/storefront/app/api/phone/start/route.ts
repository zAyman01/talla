import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import {
  clientAddress,
  errorResponse,
  readJson,
  requestContext,
  stringField,
} from '../../../../server/http.ts';
import { getStoreRuntime } from '../../../../server/runtime.ts';

export const runtime = 'nodejs';

export async function POST(request: NextRequest): Promise<NextResponse> {
  let traceId: string | undefined;
  try {
    const context = requestContext(request, getStoreRuntime());
    traceId = context.traceId;
    const body = await readJson(request);
    const phone = stringField(body, 'phone', 16);
    const challenge = await context.runtime.phone.start(
      context.store.tenantId,
      phone,
      clientAddress(request),
    );
    return NextResponse.json(
      {
        ...challenge,
        ...(context.runtime.developmentCode
          ? { developmentCode: context.runtime.developmentCode }
          : {}),
      },
      { headers: { 'cache-control': 'no-store', 'x-trace-id': traceId } },
    );
  } catch (error) {
    return errorResponse(error, traceId);
  }
}
