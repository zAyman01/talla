import type {
  IngestRejection,
  PhotoSlot,
  RawUpload,
  ValidatedPhoto,
} from '@talla/ingest';
import type { Result } from '@talla/shared';
import type { ImageWorker, ImageWorkerDependencies } from './contracts.ts';

const requiredSlots: readonly PhotoSlot[] = ['front', 'back', 'three_quarter'];
const allowedTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);
const maximumUploadBytes = 12 * 1024 * 1024;

function reject(error: IngestRejection): Result<never, IngestRejection> {
  return { ok: false, error };
}

export function createImageWorker(dependencies: ImageWorkerDependencies): ImageWorker {
  return {
    async process(upload: RawUpload) {
      if (!upload.tenantId.trim() || !upload.traceId.trim())
        return reject('INGEST_FILE_REJECTED');
      const slots = new Set(upload.photos.map((photo) => photo.slot));
      if (!slots.has('back')) return reject('INGEST_BACK_PHOTO_MISSING');
      if (!slots.has('three_quarter')) return reject('INGEST_ANGLE_MISSING');
      if (
        !slots.has('front') ||
        slots.size !== upload.photos.length ||
        upload.photos.length > requiredSlots.length + 1
      )
        return reject('INGEST_FILE_REJECTED');

      const photos: ValidatedPhoto[] = [];
      for (const photo of upload.photos) {
        if (photo.bytes.byteLength > maximumUploadBytes)
          return reject('INGEST_FILE_TOO_LARGE');
        if (!allowedTypes.has(photo.declaredContentType))
          return reject('INGEST_FORMAT_UNSUPPORTED');
        let image;
        try {
          image = await dependencies.sanitize(photo.bytes);
        } catch {
          return reject('INGEST_FILE_REJECTED');
        }
        const assessment = await dependencies.assess(image, photo.slot);
        if (!assessment.accepted) return reject(assessment.error);
        photos.push({
          slot: photo.slot,
          sha256: image.sha256,
          contentType: image.contentType,
          bytes: image.bytes.byteLength,
          width: image.width,
          height: image.height,
        });
      }
      return {
        ok: true,
        value: {
          tenantId: upload.tenantId,
          traceId: upload.traceId,
          photos,
          grayCardFound: true,
        },
      };
    },
  };
}
