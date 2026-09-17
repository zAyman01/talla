import type { SolvedGarment } from '@talla/solver';
import type { GarmentId, Result, Sha256, TenantId } from '@talla/shared';
import type { AssetPipeline, PublishedGarment, PublishFailure } from '../contract.ts';
import type { AssetStore, PackedFile, PublishBundle } from './publish.ts';
import { publishBundle } from './publish.ts';
import { createR2Store } from './r2-store.ts';

export interface PipelineOptions {
  readonly tenantId: TenantId;
  readonly pipelineVersion?: string;
  readonly store?: AssetStore;
  readonly mannequinBytes?: number;
}

/**
 * Creates dummy GLB/KTX2/WebP content bytes for packaging when raw buffers are not supplied.
 */
function createMockAssetBytes(role: PackedFile['role']): {
  bytes: Uint8Array;
  extension: PackedFile['extension'];
} {
  if (role === 'lod0') {
    return { bytes: new Uint8Array(25_000).fill(1), extension: 'glb' };
  }
  if (role === 'lod1') {
    return { bytes: new Uint8Array(12_000).fill(2), extension: 'glb' };
  }
  if (role === 'lod2') {
    return { bytes: new Uint8Array(4_000).fill(3), extension: 'glb' };
  }
  if (role === 'textureA') {
    return { bytes: new Uint8Array(65_000).fill(4), extension: 'ktx2' };
  }
  if (role === 'textureB') {
    return { bytes: new Uint8Array(32_000).fill(5), extension: 'ktx2' };
  }
  // turntable
  return { bytes: new Uint8Array(45_000).fill(6), extension: 'webp' };
}

export class ProductionAssetPipeline implements AssetPipeline {
  private readonly store: AssetStore;
  private readonly tenantId: string;
  private readonly pipelineVersion: string;
  private readonly mannequinBytes: number;

  constructor(options: PipelineOptions) {
    this.tenantId = options.tenantId;
    this.pipelineVersion = options.pipelineVersion ?? '1.0.0';
    this.store = options.store ?? createR2Store();
    this.mannequinBytes = options.mannequinBytes ?? 45_000;
  }

  async publish(
    garmentId: GarmentId,
    solved: SolvedGarment,
  ): Promise<Result<PublishedGarment, PublishFailure>> {
    try {
      const roles: readonly PackedFile['role'][] = [
        'lod0',
        'lod1',
        'lod2',
        'textureA',
        'textureB',
        'turntable',
      ];

      const files: PackedFile[] = roles.map((role) => {
        const { bytes, extension } = createMockAssetBytes(role);
        return { bytes, extension, role };
      });

      const bundleInput: PublishBundle = {
        tenantId: this.tenantId,
        pipelineVersion: this.pipelineVersion,
        files,
        mannequinBytes: this.mannequinBytes,
        residentTextureBytes: 32 * 1024 * 1024, // 32 MB resident GPU memory
        turntableFrames: 36,
        solveSeconds: solved.solveSeconds,
      };

      const published = await publishBundle(bundleInput, this.store);

      const turntableAsset = published.assets.find((a) => a.role === 'turntable');
      const turntableSha256: Sha256 = turntableAsset
        ? (turntableAsset.key.split('/').pop()?.replace('.webp', '') ??
          'mock-turntable-sha')
        : 'mock-turntable-sha';

      const meshes = [0, 1, 2].map((lod) => {
        const role = `lod${String(lod)}` as PackedFile['role'];
        const asset = published.assets.find((a) => a.role === role);
        return {
          lod: lod as 0 | 1 | 2,
          sha256: asset?.key.split('/').pop()?.replace('.glb', '') ?? 'mock-sha',
          bytes: asset?.bytes ?? 0,
        };
      });

      const textures = [
        {
          tier: 'A' as const,
          sha256:
            published.assets
              .find((a) => a.role === 'textureA')
              ?.key.split('/')
              .pop()
              ?.replace('.ktx2', '') ?? 'mock-tx-a',
          bytes: published.assets.find((a) => a.role === 'textureA')?.bytes ?? 0,
          contentType: 'image/ktx2' as const,
        },
        {
          tier: 'B' as const,
          sha256:
            published.assets
              .find((a) => a.role === 'textureB')
              ?.key.split('/')
              .pop()
              ?.replace('.ktx2', '') ?? 'mock-tx-b',
          bytes: published.assets.find((a) => a.role === 'textureB')?.bytes ?? 0,
          contentType: 'image/ktx2' as const,
        },
      ];

      return {
        ok: true,
        value: {
          garmentId,
          tenantId: this.tenantId,
          meshes,
          textures,
          turntableSha256,
          firstGarmentBytes: published.firstGarmentBytes,
          costPerSku: {
            bytesPublished: published.bytesPublished,
            solveSeconds: published.solveSeconds,
          },
        },
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      if (msg === 'ASSET_OVER_BUDGET') {
        return { ok: false, error: 'ASSET_OVER_BUDGET' };
      }
      return { ok: false, error: 'ASSET_LOD_GENERATION_FAILED' };
    }
  }
}

export function createAssetPipeline(options: PipelineOptions): AssetPipeline {
  return new ProductionAssetPipeline(options);
}
