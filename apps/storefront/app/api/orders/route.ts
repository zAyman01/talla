import { orderRoute } from '../../../server/routes.ts';

export const dynamic = 'force-dynamic';

export function POST(request: Request): Promise<Response> {
  return orderRoute(request);
}
