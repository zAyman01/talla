import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { sanitizeInSandbox } from '@talla/ingest';

describe.skipIf(process.env['TALLA_TEST_IMAGE_SANDBOX'] !== '1')(
  'isolated image worker',
  () => {
    it('re-encodes a real photo and strips EXIF before publishing', async () => {
      const raw = await readFile(
        new URL('../../../fixtures/reference/jeans.jpg', import.meta.url),
      );
      const result = await sanitizeInSandbox(raw);
      // The output is now Talla-written canonical bytes, safe to inspect downstream.
      const metadata = await sharp(result.bytes).metadata();
      expect(metadata.format).toBe('webp');
      expect(metadata.exif).toBeUndefined();
      expect(metadata.width).toBeLessThanOrEqual(2048);
      expect(metadata.height).toBeLessThanOrEqual(2048);
      expect(result.sha256).toMatch(/^[a-f0-9]{64}$/);
    }, 30000);
    it('rejects scriptable input and malformed JPEG bytes', async () => {
      await expect(
        sanitizeInSandbox(
          Buffer.from(
            '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
          ),
        ),
      ).rejects.toThrow('INGEST_INVALID_FILE');
      await expect(
        sanitizeInSandbox(Uint8Array.from([255, 216, 255, 0, 0, 0])),
      ).rejects.toThrow('INGEST_INVALID_FILE');
    }, 30000);
    it('rejects excess input before invoking a decoder', async () => {
      await expect(
        sanitizeInSandbox(new Uint8Array(12 * 1024 * 1024 + 1)),
      ).rejects.toThrow('INGEST_INVALID_FILE');
    });
  },
);
