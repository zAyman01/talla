import { createHash } from 'node:crypto';
import { assetKey, checkAssetBudget } from './budget.ts';

export interface PackedFile {
  readonly bytes: Uint8Array;
  readonly extension: 'glb' | 'ktx2' | 'webp';
  readonly role: 'lod0' | 'lod1' | 'lod2' | 'textureA' | 'textureB' | 'turntable';
}
export interface PublishBundle {
  readonly tenantId: string;
  readonly pipelineVersion: string;
  readonly files: readonly PackedFile[];
  readonly mannequinBytes: number;
  readonly residentTextureBytes: number;
  readonly turntableFrames: number;
  readonly solveSeconds: number;
}
export interface PublishedBundle {
  readonly assets: readonly {
    readonly role: PackedFile['role'];
    readonly key: string;
    readonly bytes: number;
  }[];
  readonly bytesPublished: number;
  readonly firstGarmentBytes: number;
  readonly swapBytes: number;
  readonly solveSeconds: number;
}
export interface AssetStore {
  /** A hash collision with different bytes must fail; an identical repeat is a no-op. */
  putImmutable(key: string, bytes: Uint8Array, contentType: string): Promise<void>;
}

/** Validate actual packed bytes before any external write. The catalog marks ready
 * only after this resolves; an interrupted upload may leave unreachable immutable blobs. */
export async function publishBundle(
  input: PublishBundle,
  store: AssetStore,
): Promise<PublishedBundle> {
  const required = ['lod0', 'lod1', 'lod2', 'textureA', 'textureB', 'turntable'] as const;
  if (
    input.files.length !== required.length ||
    new Set(input.files.map((f) => f.role)).size !== required.length ||
    !required.every((role) => input.files.some((f) => f.role === role)) ||
    !Number.isFinite(input.solveSeconds) ||
    input.solveSeconds < 0 ||
    !Number.isSafeInteger(input.mannequinBytes) ||
    input.mannequinBytes < 1
  )
    throw new Error('ASSET_LOD_GENERATION_FAILED');
  for (const file of input.files) {
    if (
      file.bytes.length === 0 ||
      (file.role.startsWith('lod') && file.extension !== 'glb') ||
      (file.role.startsWith('texture') && file.extension !== 'ktx2') ||
      (file.role === 'turntable' && file.extension !== 'webp')
    )
      throw new Error('ASSET_LOD_GENERATION_FAILED');
  }
  const size = (role: PackedFile['role']): number =>
    input.files.find((f) => f.role === role)?.bytes.length ?? 0;
  const swap = Math.max(size('lod1') + size('textureB'), size('turntable'));
  const first =
    input.mannequinBytes +
    Math.max(size('lod2') + size('lod1') + size('textureB'), size('turntable'));
  const gate = checkAssetBudget({
    firstGarmentBytes: first,
    swapBytes: swap,
    residentTextureBytes: input.residentTextureBytes,
    turntableFrames: input.turntableFrames,
    lods: [0, 1, 2],
    gpuTextureTypes: ['image/ktx2'],
  });
  if (!gate.ok) throw new Error(gate.error);
  const assets = input.files.map((file) => ({
    file,
    key: assetKey(
      input.tenantId,
      input.pipelineVersion,
      createHash('sha256').update(file.bytes).digest('hex'),
      file.extension,
    ),
  }));
  for (const { file, key } of assets)
    await store.putImmutable(
      key,
      file.bytes,
      file.extension === 'glb' ? 'model/gltf-binary' : `image/${file.extension}`,
    );
  return {
    assets: assets.map(({ file, key }) => ({
      role: file.role,
      key,
      bytes: file.bytes.length,
    })),
    bytesPublished: input.files.reduce((sum, file) => sum + file.bytes.length, 0),
    firstGarmentBytes: first,
    swapBytes: swap,
    solveSeconds: input.solveSeconds,
  };
}
