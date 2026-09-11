import type { ReactNode } from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { randomUUID } from 'node:crypto';
import { container } from '../../../server/container.ts';
import { readSessionToken } from '../../../server/session.ts';
import { UploadForm } from './upload-form.tsx';

/**
 * One store: everything it has, and the form to add another piece.
 *
 * The whole catalogue and the upload form on one screen is the density-7 answer to the
 * job in `docs/frontend/README.md`: get a garment live in under two minutes. A wizard
 * would read better and cost the owner more.
 */

interface GarmentRow extends Record<string, unknown> {
  readonly id: string;
  readonly name_ar: string;
  readonly price: number;
  readonly status: string;
  readonly error_code: string | null;
}

const STATUS_LABEL: Readonly<Record<string, string>> = {
  draft: 'مسودة',
  processing: 'قيد المعالجة',
  confirmation: 'بانتظار المراجعة',
  ready: 'منشور',
  failed: 'تعذّر',
  archived: 'مؤرشف',
};

export default async function Page({
  params,
}: {
  params: Promise<{ tenantId: string }>;
}): Promise<ReactNode> {
  const { tenantId } = await params;
  const { requests } = container();

  const result = await requests.withOwnerTenant(
    await readSessionToken(),
    tenantId,
    randomUUID(),
    async (sql) => {
      const { rows } = await sql.query<GarmentRow>(
        `SELECT g.id, g.name_ar, g.price, g.status,
                (SELECT j.error_code FROM jobs j
                  WHERE j.garment_id = g.id AND j.status = 'failed'
                  ORDER BY j.available_at DESC LIMIT 1) AS error_code
         FROM garments g
         ORDER BY g.created_at DESC`,
      );
      return rows;
    },
  );

  // A store the owner does not belong to, a store that does not exist, and an expired
  // session all end here. Telling them apart on screen would undo the point of them
  // failing identically underneath (ADR-0022).
  if (!result.ok) notFound();

  return (
    <main className="shell">
      <div className="bar">
        <h1>القطع</h1>
        <Link href="/">كل المتاجر</Link>
      </div>

      <div className="card">
        <h2>أضف قطعة</h2>
        <UploadForm tenantId={tenantId} />
      </div>

      {result.value.length === 0 ? (
        <p className="empty">لا توجد قطع بعد. ابدأ بإضافة واحدة.</p>
      ) : (
        <div className="card rows">
          {result.value.map((garment) => (
            <div className="row" key={garment.id}>
              <div>
                <div>{garment.name_ar}</div>
                <div className="muted">
                  {(garment.price / 100).toFixed(2)} جنيه
                  {garment.error_code !== null && ` · ${garment.error_code}`}
                </div>
              </div>
              <div className="row-actions">
                <span className="status" data-state={garment.status}>
                  {STATUS_LABEL[garment.status] ?? garment.status}
                </span>
                {garment.status === 'confirmation' && (
                  <Link href={`/s/${tenantId}/g/${garment.id}`}>راجع</Link>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
