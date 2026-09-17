import type { Sha256 } from '@talla/shared';
import type { FabricPreset } from './internal/garment.ts';

/**
 * Parametric garment blocks, their fabric presets, and the mannequin they are cut for.
 *
 * Guarantee to callers: immutable and versioned. A block_version never changes meaning,
 * so a render stays reproducible after the library moves on.
 *
 * Two things live behind this interface at once, on purpose:
 *
 * - `BlockLibrary` is the contract for artist-authored blocks fetched as assets. It is
 *   what the Dress Solver and the Asset Pipeline will consume.
 * - The generators below are the blocks that exist today: deterministic parametric
 *   geometry, computed rather than authored, with real finished measurements. They are
 *   what the viewer dresses the mannequin with until authored blocks land (ADR-0018).
 *
 * The generators are pure arithmetic over typed arrays. No Three.js, no DOM. Whatever
 * renders them owns that dependency, and this stays testable in Node.
 */

export type BlockId = string;

/** Semver. Pinned in every GarmentSpec that was solved against it. */
export type BlockVersion = string;

export interface Block {
  readonly id: BlockId;
  readonly version: BlockVersion;
  readonly category: string;
  readonly meshSha256: Sha256;
  readonly uvLayoutSha256: Sha256;
}

export interface BlockLibrary {
  /** Returns undefined rather than throwing: no matching block is a rejection upstream. */
  get(id: BlockId, version: BlockVersion): Block | undefined;
  fabric(id: string): FabricPreset | undefined;
  list(): readonly Block[];
}

export type { MeshData, Ring, SettleOptions } from './internal/geometry.ts';
export {
  computeNormals,
  loft,
  mergeMeshes,
  morphDelta,
  ringAtHeight,
  ringGirthCm,
  ringPoints,
  settleStart,
} from './internal/geometry.ts';

export type { BodyMeasurements, BodyStations } from './internal/body.ts';
export {
  ARM_LANDMARK,
  BASE_BODY_SIZE,
  BODY_SIZES,
  FIGURE_BOUNDS,
  FIGURE_HEIGHT_M,
  LANDMARK,
  bodyMesh,
  bodyStations,
  measurements,
  mirrored,
  torsoGirthAt,
} from './internal/body.ts';

export type { FabricPreset };
export type {
  FitPoint,
  GarmentBlockDefinition,
  GarmentBlockId,
  LayerDepth,
} from './internal/garment.ts';
export {
  GARMENT_BLOCKS,
  block,
  bodyGirthAtFitPoint,
  fabric,
  garmentFabric,
  garmentGirthAt,
  garmentMesh,
} from './internal/garment.ts';

export type { FitReading, FitVerdict, GarmentFit } from './internal/fit.ts';
export { garmentFit, verdictFor } from './internal/fit.ts';
