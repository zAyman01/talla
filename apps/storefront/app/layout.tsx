import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import localFont from 'next/font/local';
import './globals.css';

const ui = localFont({
  src: '../fonts/IBMPlexSansArabic-Regular.woff2',
  weight: '400',
  display: 'swap',
  variable: '--font-ui-loaded',
});
const display = localFont({
  src: '../fonts/NotoNaskhArabic.woff2',
  weight: '400 700',
  display: 'swap',
  preload: false,
  variable: '--font-display-loaded',
});

export const metadata: Metadata = {
  title: 'النسيج | متجر طلّة التجريبي',
  description: 'واجهة طلّة التجريبية لبناء طلة من كتالوج متجر الملابس.',
  robots: { index: false, follow: false },
};
export default function Layout({ children }: { children: ReactNode }): ReactNode {
  return (
    <html lang="ar" dir="rtl" className={`${ui.variable} ${display.variable}`}>
      <body>
        <a className="skip-link" href="#main">
          انتقل إلى المحتوى
        </a>
        {children}
      </body>
    </html>
  );
}
