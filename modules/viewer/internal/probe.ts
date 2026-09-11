import type { DeviceTier } from '@talla/shared';
import { chooseTier, readCachedTier, writeCachedTier } from './tier.ts';
import type { DeviceSignals } from './tier.ts';

/**
 * Gathering the signals `chooseTier` decides from.
 *
 * Everything that touches a browser API lives here, and the decision itself lives in
 * `tier.ts` as a pure function. That split is what makes the ladder testable at all: the
 * rules can be exercised in Node against a hundred device shapes, and this file stays
 * small enough to read.
 *
 * Every reading is defensive. `deviceMemory` is Chrome-only, the unmasked renderer string
 * is frequently withheld, and `navigator.connection` is not in Safari. A probe that
 * throws on a missing field would take the whole viewer down on the browsers it most
 * needs to classify correctly.
 */

/** How many iterations the micro-benchmark runs. Sized to finish well inside 200 ms. */
const BENCHMARK_ITERATIONS = 150_000;

interface NavigatorSignals {
  readonly deviceMemory?: number;
  readonly hardwareConcurrency?: number;
  readonly connection?: { readonly saveData?: boolean };
}

/**
 * A short arithmetic loop, timed.
 *
 * Deliberately not a GPU benchmark. Drawing to measure drawing costs a frame the buyer
 * is waiting for, and spec 11.2 asks for a sub-200 ms probe, not a profile. This measures
 * single-core throughput, which is what actually separates a phone that can run the
 * settle from one that cannot.
 */
function benchmark(): number {
  const started = performance.now();
  let accumulator = 0;
  for (let i = 1; i <= BENCHMARK_ITERATIONS; i += 1) {
    accumulator += Math.sqrt(i) / i;
  }
  // Consumed so the loop cannot be optimised away entirely.
  if (!Number.isFinite(accumulator)) return Number.POSITIVE_INFINITY;
  return performance.now() - started;
}

function readGl(): { renderer: string | undefined; maxTextureSize: number | undefined } {
  const canvas = document.createElement('canvas');
  const gl = canvas.getContext('webgl2');
  if (gl === null) return { renderer: undefined, maxTextureSize: undefined };

  let renderer: string | undefined;
  const debug = gl.getExtension('WEBGL_debug_renderer_info');
  if (debug !== null) {
    const value: unknown = gl.getParameter(debug.UNMASKED_RENDERER_WEBGL);
    if (typeof value === 'string') renderer = value;
  }
  const size: unknown = gl.getParameter(gl.MAX_TEXTURE_SIZE);
  const maxTextureSize = typeof size === 'number' ? size : undefined;

  // Released immediately. A browser allows only a handful of live contexts, and holding
  // one open to answer a question already answered would cost the viewer its own.
  gl.getExtension('WEBGL_lose_context')?.loseContext();
  return { renderer, maxTextureSize };
}

export function readDeviceSignals(): DeviceSignals {
  if (typeof document === 'undefined' || typeof navigator === 'undefined') {
    // Server rendering. Nothing here is knowable, and claiming tier C would hard-code the
    // fallback into every first paint.
    return {
      webglAvailable: false,
      renderer: undefined,
      deviceMemoryGb: undefined,
      hardwareConcurrency: undefined,
      benchmarkMs: undefined,
      saveData: false,
      maxTextureSize: undefined,
    };
  }

  const nav = navigator as Navigator & NavigatorSignals;
  const gl = readGl();
  return {
    webglAvailable: gl.maxTextureSize !== undefined,
    renderer: gl.renderer,
    deviceMemoryGb: typeof nav.deviceMemory === 'number' ? nav.deviceMemory : undefined,
    hardwareConcurrency:
      typeof nav.hardwareConcurrency === 'number' ? nav.hardwareConcurrency : undefined,
    benchmarkMs: benchmark(),
    saveData: nav.connection?.saveData === true,
    maxTextureSize: gl.maxTextureSize,
  };
}

/**
 * The tier for this device, cached after the first answer.
 *
 * The cache is per device and per probe version, so re-deciding on every page load is
 * avoided without the decision outliving the rules that made it. A data-saver preference
 * is re-read every time rather than trusted from cache, because a buyer can turn it on
 * between one visit and the next and the whole point is to honour it.
 */
export function probeTier(storage?: Pick<Storage, 'getItem' | 'setItem'>): DeviceTier {
  const store =
    storage ?? (typeof localStorage === 'undefined' ? undefined : localStorage);

  const signals = readDeviceSignals();
  if (signals.saveData) return 'C';

  if (store !== undefined) {
    const cached = readCachedTier(store);
    if (cached !== undefined) return cached;
  }

  const tier = chooseTier(signals);
  if (store !== undefined) writeCachedTier(store, tier);
  return tier;
}
