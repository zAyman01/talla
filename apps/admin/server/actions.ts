'use server';

import { randomUUID } from 'node:crypto';
import { redirect } from 'next/navigation';
import { errorCatalog } from '@talla/errors';
import type { ErrorCode } from '@talla/errors';
import { sanitizeInSandbox } from '@talla/ingest';
import type { PhotoSlot, RawUpload } from '@talla/ingest';
import { createImageWorker } from '@talla/worker-image';
import { enqueueJob } from '@talla/jobs-worker';
import { container } from './container.ts';
import { recordAudit } from './request.ts';
import {
  clearChallengeId,
  clearSessionToken,
  readChallengeId,
  readSessionToken,
  writeChallengeId,
  writeSessionToken,
} from './session.ts';

/**
 * Server actions for the admin screens.
 *
 * Next's own documentation warns that a Server Function arrives as a POST to the page it
 * lives on, so a proxy matcher can stop covering it without anyone noticing. Every action
 * here therefore does its own authorization through `withOwnerTenant`, which takes the
 * owner from the session and refuses any tenant outside their membership. The proxy's
 * origin check is the second lock, not the first.
 */

/** What a form shows back. Arabic first, taken from the taxonomy rather than written here. */
export interface ActionState {
  readonly message?: string | undefined;
  readonly fix?: string | undefined;
}

/**
 * A form field as text, and only if it really is text.
 *
 * `FormData.get` returns `File | string | null`, so `String(form.get(name))` turns an
 * uploaded file into the literal `[object File]` and hands it on as if it were a value
 * somebody typed. Anything that is not a string becomes the empty string and fails
 * validation, which is the right answer for a field that was sent as the wrong kind.
 */
function text(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === 'string' ? value.trim() : '';
}

function stateFor(code: ErrorCode): ActionState {
  const entry = errorCatalog[code];
  if (entry.audience === 'internal' || entry.message === undefined) {
    const fallback = errorCatalog['INTERNAL_ERROR'];
    return { message: fallback.message?.ar, fix: fallback.fixAction?.ar };
  }
  return { message: entry.message.ar, fix: entry.fixAction?.ar };
}

export async function requestCode(
  _previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  const { auth, isProduction } = container();
  const phone = text(form, 'phone');
  // The IP is only ever hashed, never stored or logged (modules/tenancy).
  const address = text(form, 'address') || '0.0.0.0';

  const started = await auth.startLogin(phone, address);
  if (!started.ok) return stateFor(started.error);

  await writeChallengeId(started.value.challengeId, isProduction);
  redirect('/?step=code');
}

export async function submitCode(
  _previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  const { auth, isProduction } = container();
  const challengeId = await readChallengeId();
  // A missing challenge cookie fails exactly as a wrong code does. Saying "your
  // code expired" versus "that code is wrong" is a difference worth nothing to an
  // owner and something to anyone probing the form.
  if (challengeId === undefined) return stateFor('AUTH_OTP_INVALID');

  const phone = text(form, 'phone');
  const code = text(form, 'code');
  const previousToken = await readSessionToken();

  const done = await auth.completeLogin(challengeId, phone, code, previousToken);
  if (!done.ok) return stateFor(done.error);

  await clearChallengeId();
  await writeSessionToken(done.value.token, isProduction);
  redirect('/');
}

export async function signOut(): Promise<void> {
  const { auth } = container();
  const token = await readSessionToken();
  if (token !== undefined) await auth.endSession(token);
  await clearSessionToken();
  redirect('/');
}

const SLOTS: readonly PhotoSlot[] = ['front', 'back', 'three_quarter', 'detail'];

/**
 * Accept photographs for a new garment.
 *
 * Bytes go from the form straight to the sandboxed, network-isolated worker and nothing
 * in this process parses them (spec 12.2). There is no unsandboxed fallback: if the
 * sandbox is unavailable the upload fails, which is the correct failure.
 */
export async function uploadGarment(
  _previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  const { requests, logger } = container();
  const tenantId = text(form, 'tenantId');
  const nameAr = text(form, 'nameAr');
  const priceText = text(form, 'price');
  const price = Number.parseInt(priceText, 10);

  if (nameAr.length < 2 || !Number.isSafeInteger(price) || price <= 0) {
    return stateFor('INGEST_FILE_REJECTED');
  }

  const photos: RawUpload['photos'][number][] = [];
  for (const slot of SLOTS) {
    const file = form.get(slot);
    if (!(file instanceof File) || file.size === 0) continue;
    photos.push({
      slot,
      declaredContentType: file.type,
      bytes: new Uint8Array(await file.arrayBuffer()),
    });
  }

  const traceId = randomUUID();
  const worker = createImageWorker({
    sanitize: sanitizeInSandbox,
    /**
     * The capture-quality assessor is Stage E. Accepting everything here is why
     * `INGEST_TOO_DARK`, `INGEST_BLURRY` and the rest are still listed as not yet
     * reachable in the taxonomy coverage test, rather than silently absent.
     */
    assess: () => Promise.resolve({ accepted: true }),
  });

  const validated = await worker.process({ tenantId, traceId, photos });
  if (!validated.ok) return stateFor(validated.error);

  const garmentId = randomUUID();
  const outcome = await requests.withOwnerTenant(
    await readSessionToken(),
    tenantId,
    traceId,
    async (sql, context) => {
      await sql.query(
        `INSERT INTO garments (tenant_id, id, name_ar, name_en, price, status)
         VALUES ($1, $2, $3, $3, $4, 'processing')`,
        [context.tenantId, garmentId, nameAr, price],
      );
      await enqueueJob(sql, {
        tenantId: context.tenantId,
        jobId: randomUUID(),
        garmentId,
        stage: 'understanding',
        traceId,
        availableAt: new Date(),
      });
      await recordAudit(sql, context, 'garment.uploaded', garmentId, {
        photos: validated.value.photos.length,
      });
    },
  );

  if (!outcome.ok) return stateFor(outcome.error);
  logger.info('admin.garment_uploaded', { traceId, tenantId, garmentId });
  redirect(`/s/${tenantId}`);
}

/**
 * Confirm a garment's derived fields and publish it.
 *
 * A store owner's corrections are the most expensive thing to lose: an owner who has to
 * make the same correction twice stops correcting. `preserveConfirmations` is what keeps
 * them across a re-run, and it lands with the understanding stage in Stage E. Until the
 * solver produces a spec there is nothing to correct, so this marks the garment ready and
 * records who did it.
 */
export async function confirmGarment(
  _previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  const { requests } = container();
  const tenantId = text(form, 'tenantId');
  const garmentId = text(form, 'garmentId');
  const traceId = randomUUID();

  const outcome = await requests.withOwnerTenant(
    await readSessionToken(),
    tenantId,
    traceId,
    async (sql, context) => {
      const { rows } = await sql.query<{ status: string }>(
        "UPDATE garments SET status = 'ready' WHERE id = $1 AND status = 'confirmation' RETURNING status",
        [garmentId],
      );
      if (rows.length === 0) return false;
      await recordAudit(sql, context, 'garment.confirmed', garmentId);
      return true;
    },
  );

  if (!outcome.ok) return stateFor(outcome.error);
  if (!outcome.value) return stateFor('ORDER_INVALID_STATE');
  redirect(`/s/${tenantId}`);
}
