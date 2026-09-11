import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import localFont from 'next/font/local';
import './globals.css';

/**
 * The admin shell. Arabic first and right to left, same as the storefront, because the
 * owner reading it runs a shop in Cairo.
 *
 * The display face is deliberately absent. Naskh is the storefront's voice; an operator
 * tool uploading four hundred pieces has no use for it, and not loading it is one less
 * thing between the owner and a fast form.
 */
const ui = localFont({
  src: '../fonts/IBMPlexSansArabic-Regular.ttf',
  weight: '400',
  display: 'swap',
  variable: '--font-ui-loaded',
});

/**
 * Never prerendered, never cached. Every admin screen is specific to one signed-in owner
 * and one store, so a statically generated copy would be either useless or somebody
 * else's. `Cache-Control: no-store` in `next.config.ts` says the same thing to the edge.
 */
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'إدارة طلّة',
  description: 'أداة رفع القطع وإدارتها لأصحاب المتاجر.',
  robots: { index: false, follow: false },
};

export default function Layout({ children }: { children: ReactNode }): ReactNode {
  return (
    <html lang="ar" dir="rtl" className={ui.variable}>
      <body>{children}</body>
    </html>
  );
}
