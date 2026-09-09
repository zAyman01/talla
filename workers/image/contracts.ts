import type {
  IngestRejection,
  PhotoSlot,
  RawUpload,
  SanitizedImage,
  ValidatedPhotoSet,
} from '@talla/ingest';
import type { Result } from '@talla/shared';

export interface ImageWorker {
  /** Decode, check, and re-encode. Output is safe for everything downstream; input is
   * assumed hostile in every field. */
  process(upload: RawUpload): Promise<Result<ValidatedPhotoSet, IngestRejection>>;
}

export type PhotoQualityRejection = Extract<
  IngestRejection,
  | 'INGEST_TOO_DARK'
  | 'INGEST_BLURRY'
  | 'INGEST_BACKGROUND_BUSY'
  | 'INGEST_GARMENT_CROPPED'
  | 'INGEST_GRAY_CARD_MISSING'
  | 'INGEST_GRAY_CARD_UNREADABLE'
>;

export interface ImageWorkerDependencies {
  /** Calls the network-isolated decoder. Never replace this with an in-process parser. */
  sanitize(bytes: Uint8Array): Promise<SanitizedImage>;
  /** Receives only Talla-written WebP bytes. The quality model never parses an upload. */
  assess(
    image: SanitizedImage,
    slot: PhotoSlot,
  ): Promise<
    | { readonly accepted: true }
    | { readonly accepted: false; readonly error: PhotoQualityRejection }
  >;
}
