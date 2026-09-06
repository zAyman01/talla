import type { GarmentSpec } from '@talla/garment-spec';
import type { GarmentId, Slot } from '@talla/shared';

/**
 * The ranker. A pure function.
 *
 * Guarantee to callers: pure, no I/O, and it never suggests something out of stock.
 * Stock arrives as an argument rather than being fetched, which is what keeps the
 * ranker testable as a property (spec 16.3).
 */

/** A store owner's pin. It outranks the model, and it is capped (ADR-0014). */
export interface Pin {
  readonly anchorId: GarmentId;
  readonly suggestedId: GarmentId;
}

export interface RankInput {
  readonly anchor: GarmentSpec;
  readonly candidates: readonly GarmentSpec[];
  /** Garment ids with at least one size in stock. Everything else is not rankable. */
  readonly inStock: ReadonlySet<GarmentId>;
  readonly pins: readonly Pin[];
  readonly fillSlots: readonly Slot[];
}

export interface Suggestion {
  readonly garmentId: GarmentId;
  readonly slot: Slot;
  readonly score: number;
  readonly pinned: boolean;
}

export interface Styling {
  rank(input: RankInput): readonly Suggestion[];
}
