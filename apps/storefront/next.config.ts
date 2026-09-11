import type { NextConfig } from 'next';
const config: NextConfig = {
  // Standalone output: the image carries the server and the traced dependencies, not the
  // whole workspace. A smaller image is a smaller thing to keep patched.
  output: 'standalone',
  transpilePackages: ['@talla/trial', '@talla/tokens', '@talla/blocks', '@talla/shared'],
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
        ],
      },
    ]);
  },
};
export default config;
