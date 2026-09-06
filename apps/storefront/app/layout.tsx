import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';

export const metadata: Metadata = {
  title: 'طلّة | مساحة الاختبار',
  description: 'مساحة تطوير طلّة لمراجعة الصور والألوان والعرض ثلاثي الأبعاد.',
  robots: { index: false, follow: false },
};
export default function Layout({ children }: { children: ReactNode }): ReactNode {
  return <html lang="ar" dir="rtl"><body><a className="skip-link" href="#main">انتقل إلى المحتوى</a>{children}</body></html>;
}
