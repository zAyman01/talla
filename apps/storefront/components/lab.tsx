'use client';
import dynamic from 'next/dynamic';
import { useState } from 'react';
import type { ReactNode } from 'react';
import {
  ArrowSquareOutIcon,
  CubeIcon,
  ImageIcon,
  DownloadSimpleIcon,
  CheckCircleIcon,
} from '@phosphor-icons/react';
import { deltaE00 } from '@talla/trial';

const Stage = dynamic(() => import('./stage.tsx').then((m) => m.Stage), {
  ssr: false,
  loading: () => (
    <div className="stage-loading" role="status">
      جارٍ تجهيز العرض…
    </div>
  ),
});
const references = [
  {
    id: 'tee-front',
    name: 'تي شيرت مطبوع',
    detail: 'صورة أمامية',
    path: '/references/tee-front.webp',
    source: 'https://commons.wikimedia.org/wiki/File:WLM_shirt_-_Female_(front).jpg',
  },
  {
    id: 'tee-back',
    name: 'القطعة نفسها',
    detail: 'صورة خلفية',
    path: '/references/tee-back.webp',
    source: 'https://commons.wikimedia.org/wiki/File:WLM_shirt_-_Female_(back).jpg',
  },
  {
    id: 'jeans',
    name: 'جينز أزرق',
    detail: 'صورة أمامية',
    path: '/references/jeans.webp',
    source: 'https://commons.wikimedia.org/wiki/File:Jeans.jpg',
  },
] as const;

export function Lab(): ReactNode {
  const [selected, setSelected] = useState(0);
  const [view, setView] = useState<'photo' | 'model'>('photo');
  const [failed, setFailed] = useState(false);
  const [measurement, setMeasurement] = useState(['50', '0', '0', '50', '0', '0']);
  const [result, setResult] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [timing, setTiming] = useState<number | null>(null);
  const reference = references[selected] ?? references[0];
  function compare(): void {
    const numbers = measurement.map((v) => (v.trim() === '' ? NaN : Number(v)));
    const [L1, a1, b1, L2, a2, b2] = numbers;
    if (
      L1 === undefined ||
      a1 === undefined ||
      b1 === undefined ||
      L2 === undefined ||
      a2 === undefined ||
      b2 === undefined
    )
      return;
    try {
      setResult(deltaE00({ L: L1, a: a1, b: b1 }, { L: L2, a: a2, b: b2 }));
      setError('');
    } catch {
      setResult(null);
      setError('أدخل قيماً صالحة. قيمة L بين 0 و100.');
    }
  }
  function download(): void {
    const blob = new Blob(
      [
        JSON.stringify(
          {
            measuredAt: new Date().toISOString(),
            fixture: 'CC0 reference mannequin',
            modelLoadMs: timing,
            userAgent: navigator.userAgent,
            physicalDeviceVerified: false,
            garmentDressed: false,
            note: 'Reference model loading only. This is not TTFD or Phase 0 pass evidence.',
          },
          null,
          2,
        ),
      ],
      { type: 'application/json' },
    );
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'talla-reference-measurement.json';
    link.click();
    setTimeout(() => {
      URL.revokeObjectURL(url);
    }, 1000);
  }
  return (
    <>
      <section className="workbench" aria-label="مراجعة الأصول">
        <div className="viewer-column">
          <div className="view-tabs" role="group" aria-label="نوع العرض">
            <button
              aria-pressed={view === 'photo'}
              onClick={() => {
                setView('photo');
              }}
            >
              <ImageIcon weight="regular" size={20} />
              صور القطعة
            </button>
            <button
              aria-pressed={view === 'model'}
              onClick={() => {
                setView('model');
              }}
            >
              <CubeIcon weight="regular" size={20} />
              اختبار المانيكان
            </button>
          </div>
          <div className="stage">
            {view === 'model' ? (
              <Stage onLoaded={setTiming} />
            ) : failed ? (
              <div className="stage-loading" role="alert">
                <p>تعذر تحميل الصورة.</p>
                <a href={reference.source}>افتح المصدر الأصلي</a>
              </div>
            ) : (
              <img
                key={reference.path}
                className="reference-photo"
                src={reference.path}
                alt={`${reference.name}، ${reference.detail}`}
                onError={() => {
                  setFailed(true);
                }}
              />
            )}
          </div>
          <div className="stage-caption">
            <span>
              {view === 'photo'
                ? `${reference.name}، ${reference.detail}`
                : 'مانيكان مرجعي لاختبار التحميل والدوران'}
            </span>
            <span className="muted">أصل مرجعي</span>
          </div>
          {view === 'model' && (
            <div className="measurement-bar" aria-live="polite">
              <span>
                {timing === null
                  ? 'يبدأ القياس عند فتح العرض'
                  : `تحميل النموذج: ${(timing / 1000).toFixed(2)} ثانية على هذا الجهاز`}
              </span>
              <button onClick={download} disabled={timing === null}>
                <DownloadSimpleIcon size={18} weight="regular" />
                حفظ القياس
              </button>
            </div>
          )}
        </div>
        <aside className="inspection">
          <h2>مكتبة الاختبار</h2>
          <p className="muted">
            نراجع الصورة الأمامية والخلفية قبل اختبار القطعة على المانيكان.
          </p>
          <div className="reference-list">
            {references.map((r, i) => (
              <button
                key={r.id}
                className="reference-row"
                aria-pressed={selected === i && view === 'photo'}
                onClick={() => {
                  setSelected(i);
                  setView('photo');
                  setFailed(false);
                }}
              >
                <span className="thumbnail">
                  <img src={r.path} alt="" loading="lazy" />
                </span>
                <span>
                  <strong>{r.name}</strong>
                  <small>{r.detail}</small>
                </span>
                {selected === i && view === 'photo' && (
                  <CheckCircleIcon size={20} weight="regular" />
                )}
              </button>
            ))}
          </div>
          <a
            className="source-link"
            href={reference.source}
            target="_blank"
            rel="noreferrer"
          >
            المصدر والترخيص
            <ArrowSquareOutIcon size={18} weight="regular" />
          </a>
          <div className="assessment">
            <h3>جاهزية تجربة المتجر</h3>
            <dl>
              <div>
                <dt>حقوق الاستخدام</dt>
                <dd>موثقة</dd>
              </div>
              <div>
                <dt>بطاقة رمادية</dt>
                <dd>غير متوفرة</dd>
              </div>
              <div>
                <dt>مراجعة صاحب المتجر</dt>
                <dd>لم تبدأ</dd>
              </div>
              <div>
                <dt>قياس اللون الفعلي</dt>
                <dd>لم يُسجل</dd>
              </div>
            </dl>
          </div>
        </aside>
      </section>
      <section className="color-section">
        <div>
          <h2>مقارنة اللون</h2>
          <p className="muted">
            أدخل قياسات CIELAB للقطعة الفعلية وللعرض. الهدف في التجربة: وسيط فرق اللون أقل
            من 3.
          </p>
          <p className="muted">القيم الأولية مثال حسابي، وليست قياساً للصور المعروضة.</p>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            compare();
          }}
        >
          <div className="color-inputs">
            {['القطعة الفعلية', 'اللون المعروض'].map((label, group) => (
              <fieldset key={label}>
                <legend>{label}</legend>
                <div className="lab-values">
                  {['L', 'a', 'b'].map((axis, i) => {
                    const index = group * 3 + i;
                    return (
                      <label key={axis}>
                        {axis}
                        <input
                          type="number"
                          step="any"
                          required
                          min={i === 0 ? 0 : undefined}
                          max={i === 0 ? 100 : undefined}
                          value={measurement[index] ?? ''}
                          onChange={(e) => {
                            setMeasurement((old) =>
                              old.map((v, j) => (j === index ? e.target.value : v)),
                            );
                            setResult(null);
                          }}
                        />
                      </label>
                    );
                  })}
                </div>
              </fieldset>
            ))}
          </div>
          <div className="compare-bar">
            <button className="primary" type="submit">
              احسب فرق اللون
            </button>
            <output aria-live="polite">
              {result === null ? 'ΔE00' : `ΔE00 = ${result.toFixed(3)}`}
            </output>
          </div>
          {error && <p role="alert">{error}</p>}
        </form>
      </section>
    </>
  );
}
