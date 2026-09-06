import type { Sha256 } from '@talla/shared';

/**
 * Hand-authored parametric garment blocks, their UV layouts, and fabric presets.
 * Static, versioned, authored by an artist rather than generated.
 *
 * Guarantee to callers: immutable and versioned. A block_version never changes meaning,
 * so a render stays reproducible after the library moves on.
 */

export type BlockId = string;

/** Semver. Pinned in every GarmentSpec that was solved against it. */
export type BlockVersion = string;

export interface FabricPreset {
  readonly id: string;
  readonly bendStiffness: number;
  readonly stretchStiffness: number;
  readonly density: number;
}

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
