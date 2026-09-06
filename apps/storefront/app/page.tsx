import type { ReactNode } from 'react';
import { Lab } from '../components/lab.tsx';

export default function Page(): ReactNode {
  return (
    <>
      <header className="header">
        <a href="/" className="wordmark" aria-label="طلّة">
          طلّة<span>Talla</span>
        </a>
        <span className="environment">مساحة الاختبار</span>
        <a href="#sources">مصادر الصور</a>
      </header>
      <main id="main">
        <div className="page-heading">
          <div>
            <p className="muted">من الصورة إلى الطلة</p>
            <h1>نختبر القطعة، ثم نبني المتجر.</h1>
          </div>
          <p>
            صور مرجعية مفتوحة الترخيص لتطوير العرض وفحص الألوان. هذه مساحة تطوير، ولا
            تستقبل طلبات شراء.
          </p>
        </div>
        <Lab />
      </main>
      <footer id="sources">
        <h2>مصادر الاختبار</h2>
        <p>
          صور التي شيرت:{' '}
          <a href="https://commons.wikimedia.org/wiki/User:Beria">
            Béria L. Rodríguez @ Wikimedia Commons
          </a>
          ، بترخيص{' '}
          <a href="https://creativecommons.org/licenses/by-sa/3.0/">CC BY-SA 3.0</a>.
          أُعيد ترميز الصور إلى WebP مع إزالة بيانات الموقع والكاميرا.
        </p>
        <p>
          صورة الجينز:{' '}
          <a href="https://commons.wikimedia.org/wiki/File:Jeans.jpg">
            Oktaeder، ملكية عامة
          </a>
          . المانيكان:{' '}
          <a href="https://github.com/UMRAM-Bilkent/supine-human-model">
            Quaternius وUMRAM، بترخيص CC0
          </a>
          .
        </p>
        <p>
          الصور لا تحتوي بطاقة رمادية أو قياسات فعلية للقطعة، لذلك لا تدخل في نتائج تجربة
          المتاجر.
        </p>
      </footer>
    </>
  );
}
