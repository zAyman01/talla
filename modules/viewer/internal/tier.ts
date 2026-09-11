import type { DeviceTier } from '@talla/shared';

/**
 * The device-tier ladder (spec 11.2).
 *
 * Not every phone that can open the store can run the viewer, and the ones that cannot
 * are disproportionately the buyers this product exists for. So the tier is decided from
 * measured signals, not from a user-agent string, and the decision is a pure function of
 * those signals so it can be tested without a browser.
 *
 * Tier C is not a consolation prize (ADR-0010). It is the same product rendered
 * differently, and it is also the correct answer to three separate situations: a device
 * that cannot run WebGL, a WebGL context lost mid-session in the Instagram WebView, and a
 * buyer who has asked their browser to save data.
 */

export interface DeviceSignals {
  /** False when `getContext('webgl2')` returns nothing, which is the whole question. */
  readonly webglAvailable: boolean;
  /** Unmasked renderer string, where the browser discloses it. Often absent. */
  readonly renderer: string | undefined;
  /** `navigator.deviceMemory`, in gigabytes. Chrome only, and coarsely rounded. */
  readonly deviceMemoryGb: number | undefined;
  readonly hardwareConcurrency: number | undefined;
  /** Milliseconds for the micro-benchmark. Lower is faster. Absent if it did not run. */
  readonly benchmarkMs: number | undefined;
  /** `navigator.connection.saveData`. A buyer asking not to spend their allowance. */
  readonly saveData: boolean;
  readonly maxTextureSize: number | undefined;
}

/**
 * Software rasterisers. A context that exists but is drawn by the CPU will run the
 * viewer at a few frames a second, which is worse than the turntable in every way.
 */
const SOFTWARE_RENDERERS = [
  'swiftshader',
  'llvmpipe',
  'softpipe',
  'microsoft basic render',
  'generic renderer',
];

/** Tier B ships 1024px textures. A device that cannot hold one cannot run tier B. */
const MINIMUM_TEXTURE_SIZE = 1024;

/**
 * Tier A thresholds. Deliberately conservative: being wrong towards A means a janky
 * viewer on a phone that cannot afford it, and being wrong towards B costs a shadow.
 */
const TIER_A_MEMORY_GB = 4;
const TIER_A_CORES = 6;
/** The micro-benchmark budget from spec 11.2. Over this, the device is not tier A. */
const TIER_A_BENCHMARK_MS = 200;

function isSoftware(renderer: string | undefined): boolean {
  if (renderer === undefined) return false;
  const lowered = renderer.toLowerCase();
  return SOFTWARE_RENDERERS.some((name) => lowered.includes(name));
}

/**
 * Pick a tier from measured signals.
 *
 * Missing signals do not push a device down. `navigator.deviceMemory` is Chrome-only and
 * the unmasked renderer string is frequently withheld, so treating absence as weakness
 * would put most of Safari on the turntable. Absence means unknown, and unknown resolves
 * to B, which is the tier spec 11.2 calls "the common case" and which runs everywhere
 * WebGL does.
 */
export function chooseTier(signals: DeviceSignals): DeviceTier {
  // No context, no viewer. Nothing below this matters.
  if (!signals.webglAvailable) return 'C';

  // The buyer asked. Spec 11.2 lists data-saver as a tier C entry condition, and
  // overriding an explicit preference to show a nicer render is not a trade to make in a
  // market where buyers watch their allowance.
  if (signals.saveData) return 'C';

  // A context drawn by the CPU is a context that will stutter through the drape settle.
  if (isSoftware(signals.renderer)) return 'C';

  if (
    signals.maxTextureSize !== undefined &&
    signals.maxTextureSize < MINIMUM_TEXTURE_SIZE
  ) {
    return 'C';
  }

  const fastEnough =
    signals.benchmarkMs === undefined || signals.benchmarkMs <= TIER_A_BENCHMARK_MS;
  const roomy =
    signals.deviceMemoryGb !== undefined && signals.deviceMemoryGb >= TIER_A_MEMORY_GB;
  const parallel =
    signals.hardwareConcurrency !== undefined &&
    signals.hardwareConcurrency >= TIER_A_CORES;

  // A device only reaches A by demonstrating it, so an unknown memory or core count
  // lands on B rather than being given the benefit of the doubt.
  return roomy && parallel && fastEnough ? 'A' : 'B';
}

/**
 * What each tier is allowed to load. The asset pipeline reads the same table, so the
 * viewer cannot ask for something the pipeline never packed.
 */
export interface TierBudget {
  readonly textureSize: number;
  readonly shadows: boolean;
  /** The LOD a first paint uses. Tier A swaps up after the figure is on screen. */
  readonly baseLod: 0 | 1 | 2;
  readonly usesTurntable: boolean;
}

export const TIER_BUDGET: Readonly<Record<DeviceTier, TierBudget>> = {
  A: { textureSize: 2048, shadows: true, baseLod: 1, usesTurntable: false },
  B: { textureSize: 1024, shadows: false, baseLod: 1, usesTurntable: false },
  C: { textureSize: 1024, shadows: false, baseLod: 2, usesTurntable: true },
};

const CACHE_KEY = 'talla.viewer.tier';
/**
 * Bumped whenever the thresholds or the signal set change, so a cached decision made by
 * an older rule set is discarded rather than honoured forever.
 */
const PROBE_VERSION = 1;

interface CachedTier {
  readonly version: number;
  readonly tier: DeviceTier;
}

function isTier(value: unknown): value is DeviceTier {
  return value === 'A' || value === 'B' || value === 'C';
}

/**
 * Read a previously cached decision.
 *
 * Storage is wrapped because it throws rather than returning null in a private window on
 * some browsers, and a viewer that fails to start because it could not read a cache would
 * be a self-inflicted outage.
 */
export function readCachedTier(
  storage: Pick<Storage, 'getItem'>,
): DeviceTier | undefined {
  try {
    const raw = storage.getItem(CACHE_KEY);
    if (raw === null) return undefined;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return undefined;
    const cached = parsed as Partial<CachedTier>;
    if (cached.version !== PROBE_VERSION || !isTier(cached.tier)) return undefined;
    return cached.tier;
  } catch {
    return undefined;
  }
}

export function writeCachedTier(
  storage: Pick<Storage, 'setItem'>,
  tier: DeviceTier,
): void {
  try {
    storage.setItem(CACHE_KEY, JSON.stringify({ version: PROBE_VERSION, tier }));
  } catch {
    // A device that cannot store the result simply probes again next time.
  }
}
