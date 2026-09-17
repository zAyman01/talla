import type { NextConfig } from 'next';

/**
 * The admin origin. Headers that must reach every response, including static assets,
 * live here; the ones that depend on the request or the environment live in `proxy.ts`.
 *
 * `sharp` and `pg` stay external: both carry native bindings that a bundler cannot
 * usefully inline, and the image worker's decoder must remain the sandboxed process
 * rather than something bundled into this one (spec 12.2).
 */
const config: NextConfig = {
  // Standalone output: the image carries the server and the traced dependencies, not the
  // whole workspace. A smaller image is a smaller thing to keep patched.
  ...(process.env['VERCEL'] ? {} : { output: 'standalone' as const }),
  transpilePackages: ['@talla/tokens', '@talla/shared'],
  serverExternalPackages: ['pg', 'sharp'],
  poweredByHeader: false,
  headers() {
    return Promise.resolve([
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Frame-Options', value: 'DENY' },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=()',
          },
          // Nothing on the admin origin is ever a cached answer for another owner.
          { key: 'Cache-Control', value: 'no-store' },
          // Spec 12.6 wants bot rules on this origin. This is the part a header can do.
          { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
        ],
      },
    ]);
  },
};
export default config;
