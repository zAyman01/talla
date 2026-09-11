'use client';

import { useActionState } from 'react';
import type { ReactNode } from 'react';
import { uploadGarment } from '../../../server/actions.ts';
import type { ActionState } from '../../../server/actions.ts';

/**
 * Three photographs and two fields. That is the whole upload, because the job is a
 * garment live in under two minutes and every extra control is time the owner spends not
 * selling.
 *
 * The bytes never touch this process: the action hands them straight to the sandboxed
 * worker (spec 12.2).
 */
const EMPTY: ActionState = {};

const SLOTS: readonly { name: string; label: string }[] = [
  { name: 'front', label: 'الأمام' },
  { name: 'back', label: 'الخلف' },
  { name: 'three_quarter', label: 'زاوية ثلاثة أرباع' },
  { name: 'detail', label: 'تفصيلة (اختياري)' },
];

export function UploadForm({ tenantId }: { tenantId: string }): ReactNode {
  const [state, action, pending] = useActionState(uploadGarment, EMPTY);
  return (
    <form action={action}>
      <input type="hidden" name="tenantId" value={tenantId} />
      <div className="field">
        <label htmlFor="nameAr">اسم القطعة</label>
        <input id="nameAr" name="nameAr" required minLength={2} maxLength={120} />
      </div>
      <div className="field">
        <label htmlFor="price">السعر بالقرش</label>
        <input id="price" name="price" inputMode="numeric" dir="ltr" required />
      </div>
      {SLOTS.map((slot) => (
        <div className="field" key={slot.name}>
          <label htmlFor={slot.name}>{slot.label}</label>
          <input
            id={slot.name}
            name={slot.name}
            type="file"
            accept="image/jpeg,image/png,image/webp"
          />
        </div>
      ))}
      {state.message !== undefined && (
        <div className="notice" role="alert">
          <span>{state.message}</span>
          {state.fix !== undefined && <span className="muted">{state.fix}</span>}
        </div>
      )}
      <button className="primary" type="submit" disabled={pending}>
        {pending ? 'جارٍ الرفع' : 'ارفع'}
      </button>
      <p className="muted">
        صور الأمام والخلف والزاوية مطلوبة. نعيد ترميز كل صورة في بيئة معزولة قبل أي خطوة
        أخرى.
      </p>
    </form>
  );
}
