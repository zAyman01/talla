import type { SolvedGarment } from '@talla/solver';
import type {
  Bytes,
  DeviceTier,
  GarmentId,
  Result,
  Sha256,
  TenantId,
} from '@talla/shared';

/**
 * LOD, morph packing, compression, budget gate, publish.
 *
 * Guarantee to callers: nothing publishes over budget. This is the only place that can
 * say "this garment is over budget, do not publish it" (spec 11.3), and it is a gate
 * rather than a warning.
 */

export type LodLevel = 0 | 1 | 2;

export interface PublishedMesh {
  readonly lod: LodLevel;
  readonly sha256: Sha256;
  readonly bytes: Bytes;
}

export interface PublishedTexture {
  readonly tier: DeviceTier;
  readonly sha256: Sha256;
  readonly bytes: Bytes;
  /** KTX2 on tiers A and B, WebP for the tier C turntable. Never a PNG as a GPU texture. */
  readonly contentType: 'image/ktx2' | 'image/webp';
}

export interface PublishedGarment {
  readonly garmentId: GarmentId;
  readonly tenantId: TenantId;
  readonly meshes: readonly PublishedMesh[];
  readonly textures: readonly PublishedTexture[];
  /** 36 frames, drag to spin. Tier C degrades the rendering, not the product. */
  readonly turntableSha256: Sha256;
  readonly firstGarmentBytes: Bytes;
  /** Emitted on every publish so unit economics stay measured, not assumed (spec 11.3). */
  readonly costPerSku: { readonly bytesPublished: Bytes; readonly solveSeconds: number };
}

export type PublishFailure = 'ASSET_OVER_BUDGET' | 'ASSET_LOD_GENERATION_FAILED';

export interface AssetPipeline {
  publish(
    garmentId: GarmentId,
    solved: SolvedGarment,
  ): Promise<Result<PublishedGarment, PublishFailure>>;
}
