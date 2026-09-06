import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import localFont from 'next/font/local';
import './globals.css';

const ui = localFont({
  src: '../fonts/IBMPlexSansArabic-Regular.ttf',
  weight: '400',
  display: 'swap',
  variable: '--font-ui-loaded',
});
const display = localFont({
  src: '../fonts/NotoNaskhArabic.ttf',
  weight: '400 700',
  display: 'swap',
  preload: false,
  variable: '--font-display-loaded',
});

export const metadata: Metadata = {
  title: 'طلّة | مساحة الاختبار',
  description: 'مساحة تطوير طلّة لمراجعة الصور والألوان والعرض ثلاثي الأبعاد.',
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
