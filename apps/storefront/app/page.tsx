import type { ReactNode } from 'react';
import { headers } from 'next/headers';
import { TRACE_HEADER } from '@talla/http';
import { container } from '../server/container.ts';
import { readCatalog } from '../server/catalog.ts';
import { Storefront } from '../components/storefront.tsx';
import { ClosedStore } from '../components/closed-store.tsx';

/**
 * The buyer's page, rendered per request from the store the host names.
 *
 * Never prerendered: which store this is depends on the `Host` header, and a statically
 * generated copy would be one store's catalogue served to every other.
 */
export const dynamic = 'force-dynamic';

export default async function Page(): Promise<ReactNode> {
  const { requests } = container();
  const incoming = await headers();

  const result = await requests.withTenant(
    incoming.get('host'),
    incoming.get(TRACE_HEADER) ?? 'untraced',
    (sql) => readCatalog(sql),
  );

  // A host that resolves to nothing and a suspended store look identical here, because
  // they look identical underneath (modules/tenancy). Telling them apart on screen would
  // hand an attacker the list of stores that exist.
  if (!result.ok) return <ClosedStore />;

  return <Storefront products={result.value} />;
}
