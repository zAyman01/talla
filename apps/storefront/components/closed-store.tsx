import type { ReactNode } from 'react';

/** A host that names no store. Says nothing about whether one ever existed. */
export function ClosedStore(): ReactNode {
  return (
    <main className="store-shell">
      <div className="closed-store">
        <h1>هذا المتجر غير متاح</h1>
        <p>تأكد من الرابط، أو تواصل مع المتجر مباشرة.</p>
      </div>
    </main>
  );
}
