import type { ReactNode } from 'react';
import Link from 'next/link';

/**
 * One page for every way a request can fail to reach something.
 *
 * A store the owner does not belong to, a store that does not exist, and an expired
 * session all arrive here, and they must stay indistinguishable: separating them would
 * tell a signed-in owner which other stores are on Talla (ADR-0022).
 */
export default function NotFound(): ReactNode {
  return (
    <main className="shell">
      <div className="bar">
        <h1>غير متاح</h1>
      </div>
      <div className="card">
        <p>هذه الصفحة غير موجودة، أو انتهت جلستك.</p>
        <Link href="/">العودة إلى المتاجر</Link>
      </div>
    </main>
  );
}
