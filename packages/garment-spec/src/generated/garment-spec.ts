/**
 * Generated file. Do not edit.
 *
 * Source: docs/architecture/garment-spec.schema.json
 * Regenerate: pnpm --filter @talla/garment-spec generate
 *
 * GarmentSpec is the seam of the whole system (spec section 7). A field cannot drift
 * because no one hand-writes the type. A hand-edit here fails the drift test in CI.
 */

export type ConfidenceValue = number;

/**
 * The contract between Garment Understanding and every downstream consumer. Additive changes only within a major version. See docs/architecture/garment-spec.md.
 */
export interface GarmentSpec {
  /**
   * Semver of this schema, not of the garment.
   */
  spec_version: string;
  id: string;
  tenant_id: string;
  /**
   * Content-addressed refs to the canonical re-encoded photos, never to raw uploads.
   */
  source_photo_refs: {
    front: AssetRef;
    back: AssetRef;
    three_quarter: AssetRef;
    detail?: AssetRef;
  };
  /**
   * Maps to exactly one block in the block library. An unmappable garment is a rejection, not a guess.
   */
  category:
    | 'tee'
    | 'shirt'
    | 'blouse'
    | 'knit'
    | 'sweatshirt'
    | 'jacket'
    | 'coat'
    | 'dress'
    | 'abaya'
    | 'kaftan'
    | 'jean'
    | 'trouser'
    | 'chino'
    | 'short'
    | 'skirt'
    | 'shoe'
    | 'bag'
    | 'accessory';
  block_id: string;
  /**
   * Pinned so a render stays reproducible after the library moves on.
   */
  block_version: string;
  /**
   * Store selected, never inferred. Drives solver drape behaviour.
   */
  fabric:
    | 'cotton_jersey'
    | 'denim'
    | 'silk_viscose'
    | 'wool'
    | 'leather'
    | 'linen'
    | 'synthetic_blend';
  /**
   * Feeds the solver and the screen-reader description. Null means not applicable to this category.
   */
  attributes: {
    sleeve_length?: 'sleeveless' | 'cap' | 'short' | 'three_quarter' | 'long' | null;
    neckline?: 'crew' | 'v' | 'scoop' | 'boat' | 'collared' | 'mock' | 'hooded' | null;
    hem?: 'straight' | 'curved' | 'asymmetric' | 'cropped' | 'ribbed' | null;
    closure?: 'none' | 'button' | 'zip' | 'wrap' | 'tie' | null;
    rise?: 'low' | 'mid' | 'high' | null;
    leg_shape?: 'skinny' | 'slim' | 'straight' | 'wide' | 'tapered' | 'flared' | null;
  };
  /**
   * UV-ready assets in sRGB. The renderer works in linear and tone-maps once at output.
   */
  textures: {
    front: AssetRef;
    back: AssetRef;
    detail?: AssetRef;
  };
  /**
   * Records what white balancing happened, so a wrong color is diagnosable rather than mysterious.
   */
  color_profile: {
    working_space: 'srgb' | 'display_p3';
    gray_card_found: boolean;
    illuminant_estimate_k?: number | null;
    correction_applied: {
      gain_r: number;
      gain_g: number;
      gain_b: number;
      exposure_ev: number;
    };
    residual_confidence?: ConfidenceValue;
  };
  /**
   * Holds the stock reference, never the count. Stock changes far more often than a spec and must not force a re-publish.
   *
   * @minItems 1
   */
  sizes_available: [
    {
      size: 'XS' | 'S' | 'M' | 'L' | 'XL' | 'XXL';
      stock_ref: string;
    },
    ...{
      size: 'XS' | 'S' | 'M' | 'L' | 'XL' | 'XXL';
      stock_ref: string;
    }[]
  ];
  /**
   * Consumed only by the styling engine.
   */
  style: {
    /**
     * 1 beachwear to 5 tailored. Hard rule: gap greater than 1 is rejected.
     */
    formality: number;
    season: 'hot' | 'mild' | 'cold' | 'all';
    /**
     * CIELAB, not RGB. Harmony is judged in a perceptual space.
     *
     * @minItems 1
     * @maxItems 3
     */
    dominant_colors:
      | [
          {
            L: number;
            a: number;
            b: number;
            weight: number;
          }
        ]
      | [
          {
            L: number;
            a: number;
            b: number;
            weight: number;
          },
          {
            L: number;
            a: number;
            b: number;
            weight: number;
          }
        ]
      | [
          {
            L: number;
            a: number;
            b: number;
            weight: number;
          },
          {
            L: number;
            a: number;
            b: number;
            weight: number;
          },
          {
            L: number;
            a: number;
            b: number;
            weight: number;
          }
        ];
    pattern_busy: number;
    volume: 'slim' | 'regular' | 'oversized';
    slot: 'outer' | 'top' | 'bottom' | 'shoes' | 'bag' | 'accessory';
  };
  /**
   * Per derived field. Keys are dotted paths into this document, for example 'style.formality'.
   */
  confidence: {
    [k: string]: ConfidenceValue;
  };
  /**
   * Set by the confirmation screen. A re-run must inherit prior confirmations and must never overwrite a confirmed field with a model output.
   */
  confirmed_by_store: boolean;
  /**
   * Dotted paths the store explicitly corrected or approved. These are immune to re-processing.
   */
  confirmed_fields: string[];
}
export interface AssetRef {
  sha256: string;
  content_type: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/ktx2';
  bytes?: number;
}
