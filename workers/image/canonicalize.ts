import sharp from 'sharp';
import { createHash } from 'node:crypto';

export interface CanonicalImage {
  readonly sha256: string;
  readonly contentType: 'image/webp';
  readonly width: number;
  readonly height: number;
  readonly bytes: Uint8Array;
}
const MAX_UPLOAD_BYTES = 12 * 1024 * 1024;
const MAX_PIXELS = 16_000_000;

function allowed(bytes: Uint8Array): boolean {
  const b = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return (
    (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) ||
    (b.length >= 8 &&
      b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) ||
    (b.length >= 12 &&
      b.toString('ascii', 0, 4) === 'RIFF' &&
      b.toString('ascii', 8, 12) === 'WEBP')
  );
}

/** Only called inside the isolated image-worker container, never from a web process. */
export async function canonicalize(bytes: Uint8Array): Promise<CanonicalImage> {
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_UPLOAD_BYTES || !allowed(bytes))
    throw new Error('INGEST_INVALID_FILE');
  sharp.cache(false);
  sharp.concurrency(1);
  const input = sharp(bytes, {
    limitInputPixels: MAX_PIXELS,
    failOn: 'warning',
    sequentialRead: true,
  });
  const metadata = await input.metadata();
  if (
    !metadata.width ||
    !metadata.height ||
    metadata.width * metadata.height > MAX_PIXELS ||
    (metadata.pages ?? 1) !== 1
  )
    throw new Error('INGEST_INVALID_FILE');
  // rotate() consumes EXIF orientation; default output strips EXIF and GPS. No
  // metadata preservation methods are allowed here. Alpha is retained for textures.
  const { data, info } = await input
    .rotate()
    .resize({ width: 2048, height: 2048, fit: 'inside', withoutEnlargement: true })
    .toColourspace('srgb')
    .webp({ quality: 90, effort: 4 })
    .toBuffer({ resolveWithObject: true });
  return {
    sha256: createHash('sha256').update(data).digest('hex'),
    contentType: 'image/webp',
    width: info.width,
    height: info.height,
    bytes: data,
  };
}
