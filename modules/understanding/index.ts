import type { GarmentSpec } from '@talla/garment-spec';
import type { ValidatedPhotoSet } from '@talla/ingest';
import type { Result, Sha256 } from '@talla/shared';

/**
 * Segmentation, attributes, and color. Emits one GarmentSpec plus texture assets.
 *
 * Guarantee to callers: every derived field carries a confidence value, and a re-run
 * inherits prior store confirmations rather than overwriting them (spec 7).
 */

export interface TextureAsset {
  readonly slot: 'front' | 'back' | 'detail';
  readonly sha256: Sha256;
}

export interface Understood {
  readonly spec: GarmentSpec;
  readonly textures: readonly TextureAsset[];
}

export type UnderstandingFailure = 'UNDERSTAND_SEGMENTATION_FAILED';

export interface Understanding {
  /**
   * `previous` carries an earlier spec for the same garment, when there is one, so
   * confirmed fields survive re-processing. Losing an owner's corrections is the
   * fastest way to make them stop correcting.
   */
  understand(
    photos: ValidatedPhotoSet,
    previous?: GarmentSpec,
  ): Promise<Result<Understood, UnderstandingFailure>>;
}
