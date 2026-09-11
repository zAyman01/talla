import { readyRoute } from '../../../server/routes.ts';

export const dynamic = 'force-dynamic';

export function GET(): Promise<Response> {
  return readyRoute();
}
