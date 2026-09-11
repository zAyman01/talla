import { healthRoute } from '../../../server/routes.ts';

export const dynamic = 'force-dynamic';

export function GET(): Response {
  return healthRoute();
}
