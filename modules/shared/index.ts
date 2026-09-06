/**
 * Genuinely shared code. Explicit, small, reviewed.
 *
 * This is not a utils module and must not become one: it holds vocabulary that more
 * than one module needs in its own published interface, and nothing else (spec 16.2).
 */

/** Hex sha256, lowercase. Assets are content addressed (ADR-0009). */
export type Sha256 = string;

/** One trace per garment job, upload to publish (spec 16.5). */
export type TraceId = string;

export type TenantId = string;

export type GarmentId = string;

/** Bytes over the wire, compressed. The budget in spec 11.1 is measured in these. */
export type Bytes = number;

/**
 * Probed on load, cached per device (spec 11.2). Tier C is a rendering fallback, not a
 * lesser product: the Asset Pipeline produces it from the same solved meshes.
 */
export type DeviceTier = 'A' | 'B' | 'C';

export type BodySize = 'XS' | 'S' | 'M' | 'L' | 'XL' | 'XXL';

/** Where a garment sits in an outfit. Shared because styling and viewer both layer by it. */
export type Slot = 'outer' | 'top' | 'bottom' | 'shoes' | 'bag' | 'accessory';

/**
 * A failure carries a taxonomy code, never a free-text string. Modules return this
 * rather than throwing, so a caller cannot ignore the failure by not catching it.
 */
export type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };
