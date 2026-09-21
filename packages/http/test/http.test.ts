import { describe, expect, it } from 'vitest';
import {
  isSafeMethod,
  newTraceId,
  securityHeaders,
  writeIsSameOrigin,
} from '../src/index.ts';

describe('newTraceId', () => {
  it('mints a fresh id every time', () => {
    const ids = new Set(Array.from({ length: 100 }, () => newTraceId()));
    expect(ids.size).toBe(100);
    expect([...ids][0]).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe('writeIsSameOrigin', () => {
  it('lets safe methods through without an Origin', () => {
    for (const method of ['GET', 'HEAD', 'OPTIONS', 'get']) {
      expect(writeIsSameOrigin(method, null, 'store-a.talla.app'), method).toBe(true);
    }
  });

  it('allows a write from our own page', () => {
    expect(
      writeIsSameOrigin('POST', 'https://store-a.talla.app', 'store-a.talla.app'),
    ).toBe(true);
  });

  it('refuses a write from another site', () => {
    expect(writeIsSameOrigin('POST', 'https://evil.example', 'store-a.talla.app')).toBe(
      false,
    );
  });

  it('refuses a write from a different tenant of the same platform', () => {
    // One store must not be able to post into another's order endpoint from its own page.
    expect(
      writeIsSameOrigin('POST', 'https://store-b.talla.app', 'store-a.talla.app'),
    ).toBe(false);
  });

  it('refuses a write with no Origin at all', () => {
    expect(writeIsSameOrigin('POST', null, 'store-a.talla.app')).toBe(false);
  });

  it('refuses the opaque origin a sandboxed iframe sends', () => {
    expect(writeIsSameOrigin('POST', 'null', 'store-a.talla.app')).toBe(false);
  });

  it('refuses a malformed Origin rather than parsing it generously', () => {
    for (const origin of ['store-a.talla.app', '://nonsense', '']) {
      expect(writeIsSameOrigin('POST', origin, 'store-a.talla.app'), origin).toBe(false);
    }
  });

  it('ignores the scheme, because X-Forwarded-Proto is not trustworthy input', () => {
    expect(
      writeIsSameOrigin('POST', 'http://store-a.talla.app', 'store-a.talla.app'),
    ).toBe(true);
  });

  it('compares hosts case insensitively but keeps the port significant', () => {
    expect(
      writeIsSameOrigin('POST', 'https://STORE-A.talla.app', 'store-a.talla.app'),
    ).toBe(true);
    // A different port is a different origin, which matters in local development where
    // storefront and admin sit on one hostname and two ports.
    expect(writeIsSameOrigin('POST', 'http://localhost:3001', 'localhost:3000')).toBe(
      false,
    );
  });

  it('refuses every unsafe method, not just POST', () => {
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
      expect(
        writeIsSameOrigin(method, 'https://evil.example', 'a.talla.app'),
        method,
      ).toBe(false);
    }
  });
});

describe('isSafeMethod', () => {
  it('treats only read methods as safe', () => {
    expect(isSafeMethod('GET')).toBe(true);
    expect(isSafeMethod('POST')).toBe(false);
  });
});

describe('securityHeaders', () => {
  it('sends HSTS with subdomains and preload in production', () => {
    const headers = new Map(securityHeaders({ hsts: true }));
    expect(headers.get('Strict-Transport-Security')).toBe(
      'max-age=63072000; includeSubDomains; preload',
    );
  });

  it('sends no HSTS outside production', () => {
    // Pinning a developer's browser to HTTPS for http://localhost costs them an
    // afternoon and teaches them to distrust the headers.
    expect(securityHeaders({ hsts: false })).toEqual([]);
  });

  it('allows eval only when a caller explicitly enables the development runtime', () => {
    const development = new Map(
      securityHeaders({ hsts: false, nonce: 'test', allowUnsafeEval: true }),
    );
    const production = new Map(
      securityHeaders({ hsts: true, nonce: 'test', allowUnsafeEval: false }),
    );
    expect(development.get('Content-Security-Policy')).toContain("'unsafe-eval'");
    expect(production.get('Content-Security-Policy')).not.toContain("'unsafe-eval'");
  });
});
