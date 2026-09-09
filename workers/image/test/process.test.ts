import { describe, expect, it, vi } from 'vitest';
import type { RawUpload } from '@talla/ingest';
import { createImageWorker } from '../index.ts';

const slots = ['front', 'back', 'three_quarter'] as const;

function upload(selected: readonly (typeof slots)[number][] = slots): RawUpload {
  return {
    tenantId: 'tenant-id',
    traceId: 'trace-id',
    photos: selected.map((slot) => ({
      slot,
      declaredContentType: 'image/jpeg',
      bytes: Uint8Array.from([255, 216, 255, 217]),
    })),
  };
}

function dependencies() {
  return {
    sanitize: vi.fn(() =>
      Promise.resolve({
        bytes: Uint8Array.from([1, 2, 3]),
        sha256: 'a'.repeat(64),
        width: 1200,
        height: 1600,
        contentType: 'image/webp' as const,
      }),
    ),
    assess: vi.fn(() => Promise.resolve({ accepted: true as const })),
  };
}

describe('image worker upload orchestration', () => {
  it('requires front, back, and three-quarter slots before decoding', async () => {
    const deps = dependencies();
    const worker = createImageWorker(deps);
    await expect(worker.process(upload(['front', 'three_quarter']))).resolves.toEqual({
      ok: false,
      error: 'INGEST_BACK_PHOTO_MISSING',
    });
    await expect(worker.process(upload(['front', 'back']))).resolves.toEqual({
      ok: false,
      error: 'INGEST_ANGLE_MISSING',
    });
    expect(deps.sanitize).not.toHaveBeenCalled();
  });

  it('sanitizes every photo before assessment and emits metadata only', async () => {
    const deps = dependencies();
    const result = await createImageWorker(deps).process(upload());
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('Expected accepted upload');
    expect(result.value.grayCardFound).toBe(true);
    expect(result.value.photos).toHaveLength(3);
    expect(typeof result.value.photos[0]?.bytes).toBe('number');
    expect(deps.sanitize).toHaveBeenCalledTimes(3);
    expect(deps.assess).toHaveBeenCalledTimes(3);
  });

  it('maps decoder details to the safe store-facing rejection', async () => {
    const deps = dependencies();
    deps.sanitize.mockRejectedValueOnce(new Error('decoder metadata from upload'));
    await expect(createImageWorker(deps).process(upload())).resolves.toEqual({
      ok: false,
      error: 'INGEST_FILE_REJECTED',
    });
  });

  it('stops at the first actionable quality failure', async () => {
    const deps = dependencies();
    const failing = {
      ...deps,
      assess: vi.fn(() =>
        Promise.resolve({
          accepted: false as const,
          error: 'INGEST_GRAY_CARD_MISSING' as const,
        }),
      ),
    };
    await expect(createImageWorker(failing).process(upload())).resolves.toEqual({
      ok: false,
      error: 'INGEST_GRAY_CARD_MISSING',
    });
    expect(deps.sanitize).toHaveBeenCalledTimes(1);
  });
});
