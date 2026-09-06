import type { ErrorCode } from '@talla/errors';
import type { Bytes, Result, Sha256, TenantId, TraceId } from '@talla/shared';

/**
 * The trust boundary. Untrusted input stops here.
 *
 * Guarantee to callers: everything downstream is well formed, re-encoded by us, and
 * free of EXIF. Nothing past this module parses bytes chosen by someone outside the
 * system (spec 12.2).
 */

export type PhotoSlot = 'front' | 'back' | 'three_quarter' | 'detail';

/** What arrives from the admin upload form. Untrusted in every field. */
export interface RawUpload {
  readonly tenantId: TenantId;
  readonly traceId: TraceId;
  readonly photos: ReadonlyArray<{
    readonly slot: PhotoSlot;
    readonly declaredContentType: string;
    readonly bytes: Uint8Array;
  }>;
}

/** A photo after the sandboxed worker has re-encoded it. Safe to hand downstream. */
export interface ValidatedPhoto {
  readonly slot: PhotoSlot;
  readonly sha256: Sha256;
  readonly contentType: 'image/jpeg' | 'image/png' | 'image/webp';
  readonly bytes: Bytes;
  readonly width: number;
  readonly height: number;
}

export interface ValidatedPhotoSet {
  readonly tenantId: TenantId;
  readonly traceId: TraceId;
  readonly photos: readonly ValidatedPhoto[];
  readonly grayCardFound: boolean;
}

/** Rejections are the store's experience of Talla's quality, so they name the fix. */
export type IngestRejection = Extract<ErrorCode, `INGEST_${string}`>;

export interface Ingest {
  accept(upload: RawUpload): Promise<Result<ValidatedPhotoSet, IngestRejection>>;
}

export { sanitizeInSandbox } from './internal/sandbox.ts';
export type { SanitizedImage } from './internal/sandbox.ts';
