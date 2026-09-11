import type { ReactNode } from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { randomUUID } from 'node:crypto';
import { container } from '../../../../../server/container.ts';
import { readSessionToken } from '../../../../../server/session.ts';
import { ConfirmForm } from './confirm-form.tsx';

/**
 * Review what Talla derived, then publish.
 *
 * This is the screen `preserveConfirmations` exists for: whatever the owner corrects here
 * has to survive a re-run, because an owner who makes the same correction twice stops
 * correcting. The fields themselves arrive with the understanding stage in Stage E, so
 * today this shows what is known and publishes, and the shape is ready for them.
 */

interface GarmentRow extends Record<string, unknown> {
  readonly id: string;
  readonly name_ar: string;
  readonly price: number;
  readonly status: string;
  readonly spec: unknown;
}

export default async function Page({
  params,
}: {
  params: Promise<{ tenantId: string; garmentId: string }>;
}): Promise<ReactNode> {
  const { tenantId, garmentId } = await params;
  const { requests } = container();

  const result = await requests.withOwnerTenant(
    await readSessionToken(),
    tenantId,
    randomUUID(),
    async (sql) => {
      const { rows } = await sql.query<GarmentRow>(
        'SELECT id, name_ar, price, status, spec FROM garments WHERE id = $1',
        [garmentId],
      );
      return rows[0];
    },
  );

  if (!result.ok || result.value === undefined) notFound();
  const garment = result.value;

  return (
    <main className="shell">
      <div className="bar">
        <h1>{garment.name_ar}</h1>
        <Link href={`/s/${tenantId}`}>رجوع</Link>
      </div>

      <div className="card">
        <div className="row">
          <span className="muted">السعر</span>
          <span>{(garment.price / 100).toFixed(2)} جنيه</span>
        </div>
        <div className="row">
          <span className="muted">الحالة</span>
          <span className="status" data-state={garment.status}>
            {garment.status === 'confirmation' ? 'بانتظار المراجعة' : garment.status}
          </span>
        </div>
        {garment.spec === null && (
          <p className="muted">
            لم تُستخرج تفاصيل القطعة بعد. سيظهر هنا القصّة والخامة واللون لمراجعتها قبل
            النشر.
          </p>
        )}
      </div>

      {garment.status === 'confirmation' && (
        <div className="card">
          <h2>النشر</h2>
          <ConfirmForm tenantId={tenantId} garmentId={garment.id} />
        </div>
      )}
    </main>
  );
}
