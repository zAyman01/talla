import type { PublishedGarment } from '@talla/assets';
import type { BodySize, DeviceTier, Slot } from '@talla/shared';

/**
 * Browser 3D and the device-tier ladder.
 *
 * Guarantee to callers: degrades by tier, never blanks. A lost WebGL context falls back
 * to the tier C turntable rather than showing an empty canvas (spec 11.2).
 */

export interface ViewerMountOptions {
  readonly canvas: HTMLCanvasElement;
  /** Omit to probe. The probe result is cached per device. */
  readonly tier?: DeviceTier;
  readonly bodySize: BodySize;
  readonly reducedMotion: boolean;
}

export interface ViewerSession {
  /** Layering resolves by slot, outermost last. */
  dress(
    garments: ReadonlyArray<{ garment: PublishedGarment; slot: Slot }>,
  ): Promise<void>;
  /** A vertex blend. No network request: body sizes ship as morph deltas (spec 11.3). */
  setBodySize(size: BodySize): void;
  /** The tier actually in use, which is not always the tier requested. */
  currentTier(): DeviceTier;
  dispose(): void;
}

export interface Viewer {
  mount(options: ViewerMountOptions): Promise<ViewerSession>;
}

export {
  chooseTier,
  readCachedTier,
  writeCachedTier,
  TIER_BUDGET,
} from './internal/tier.ts';
export type { DeviceSignals, TierBudget } from './internal/tier.ts';
export { probeTier, readDeviceSignals } from './internal/probe.ts';
