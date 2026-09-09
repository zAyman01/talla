import Link from 'next/link';
import type { ReactNode } from 'react';

export default function NotFound(): ReactNode {
  return (
    <main id="main" className="message-page">
      <p className="eyebrow">404</p>
      <h1>هذه الصفحة غير موجودة</h1>
      <p>يمكنك الرجوع إلى المتجر وبناء طلة جديدة من القطع المتاحة.</p>
      <Link href="/" className="primary-link">
        الرجوع إلى المتجر
      </Link>
    </main>
  );
}
