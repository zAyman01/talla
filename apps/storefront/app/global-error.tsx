'use client';

import type { ReactNode } from 'react';

export default function GlobalError({ reset }: { reset: () => void }): ReactNode {
  return (
    <html lang="ar" dir="rtl">
      <body>
        <main className="message-page">
          <h1>تعذر فتح المتجر</h1>
          <p>حدث عطل مؤقت. أعد المحاولة، أو ارجع لاحقاً إذا استمر.</p>
          <button
            className="primary"
            onClick={() => {
              reset();
            }}
          >
            إعادة المحاولة
          </button>
        </main>
      </body>
    </html>
  );
}
