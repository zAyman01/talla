import { describe, expect, it } from 'vitest';
import { createTenancy, subdomainFromHost } from '../index.ts';

describe('tenant host resolution', () => {
  it('accepts one exact subdomain and normalizes ports and case', () => {
    expect(subdomainFromHost('Store-One.Talla.test:443', 'talla.test')).toBe('store-one');
  });

  it('resolves a parent domain that carries a port, which is every development machine', () => {
    // TALLA_STOREFRONT_ROOT_DOMAIN is localhost:3000 locally. The port is not part of
    // what makes a host a child of a domain, and treating it as part of the name meant
    // every seeded store rendering as "this store is unavailable".
    expect(subdomainFromHost('nasij.localhost:3000', 'localhost:3000')).toBe('nasij');
    expect(subdomainFromHost('nasij.localhost', 'localhost:3000')).toBe('nasij');
    expect(subdomainFromHost('localhost:3000', 'localhost:3000')).toBeUndefined();
  });

  it('rejects suffix spoofing, nested names, parent hosts, and invalid labels', () => {
    for (const host of [
      'store.talla.test.attacker.example',
      'nested.store.talla.test',
      'talla.test',
      '-store.talla.test',
      'store.talla.test/path',
    ])
      expect(subdomainFromHost(host, 'talla.test')).toBeUndefined();
  });

  it('does not reveal whether a tenant is missing or suspended', async () => {
    const tenancy = createTenancy('talla.test', {
      findBySubdomain: (subdomain) =>
        Promise.resolve(
          subdomain === 'suspended'
            ? { tenantId: 'tenant-id', subdomain, active: false }
            : undefined,
        ),
      runWithTenant: (_tenantId, work) => work(),
    });
    await expect(tenancy.resolve('missing.talla.test', 'trace')).resolves.toEqual({
      ok: false,
      error: 'AUTH_FORBIDDEN',
    });
    await expect(tenancy.resolve('suspended.talla.test', 'trace')).resolves.toEqual({
      ok: false,
      error: 'AUTH_FORBIDDEN',
    });
  });

  it('binds resolved work to the resolved tenant identity', async () => {
    const calls: string[] = [];
    const tenancy = createTenancy('talla.test', {
      findBySubdomain: (subdomain) =>
        Promise.resolve({ tenantId: 'tenant-id', subdomain, active: true }),
      runWithTenant: async (tenantId, work) => {
        calls.push(tenantId);
        return work();
      },
    });
    const result = await tenancy.resolve('store.talla.test', 'trace');
    if (!result.ok) throw new Error('Expected tenant');
    await expect(
      tenancy.withContext(result.value, () => Promise.resolve(42)),
    ).resolves.toBe(42);
    expect(calls).toEqual(['tenant-id']);
  });
});
