import type { MannequinScene, SceneOptions } from './internal/scene.ts';

/**
 * Browser 3D and the device-tier ladder.
 *
 * Guarantee to callers: degrades by tier, never blanks. A device that cannot render, and
 * a WebGL context lost mid-session, both fall back rather than showing an empty canvas
 * (spec 11.2).
 *
 * The tier decision is synchronous and cheap, because the page has to make it before it
 * knows whether a viewer exists at all. The scene is asynchronous and expensive, because
 * it is Three.js. Those two facts are why `createMannequinScene` returns a promise: the
 * engine arrives in its own chunk, and importing this module to ask about a tier cannot
 * put a 3D engine in a first paint (spec 11.3).
 */

export {
  chooseTier,
  readCachedTier,
  writeCachedTier,
  TIER_BUDGET,
} from './internal/tier.ts';
export type { DeviceSignals, TierBudget } from './internal/tier.ts';
export { probeTier, readDeviceSignals } from './internal/probe.ts';
export type {
  DressedGarment,
  MannequinScene,
  MannequinView,
  SceneOptions,
  SceneStyle,
} from './internal/scene.ts';

/**
 * Build the mannequin scene, loading the renderer on the way.
 *
 * Rejects if the device will not give up a WebGL context. Callers settle the tier first,
 * so by the time this is called a refusal is a genuine failure rather than a device that
 * was never going to render at all.
 */
export async function createMannequinScene(
  options: SceneOptions,
): Promise<MannequinScene> {
  const scene = await import('./internal/scene.ts');
  return scene.createMannequinScene(options);
}
