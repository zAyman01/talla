import { describe, expect, it } from 'vitest';
import {
  TIER_BUDGET,
  chooseTier,
  readCachedTier,
  writeCachedTier,
} from '../internal/tier.ts';
import type { DeviceSignals } from '../internal/tier.ts';

/** A capable mid-range Android: the device tier A exists for. */
const capable: DeviceSignals = {
  webglAvailable: true,
  renderer: 'Adreno (TM) 730',
  deviceMemoryGb: 8,
  hardwareConcurrency: 8,
  benchmarkMs: 40,
  saveData: false,
  maxTextureSize: 8192,
};

const signals = (overrides: Partial<DeviceSignals>): DeviceSignals => ({
  ...capable,
  ...overrides,
});

describe('chooseTier', () => {
  it('puts a capable device on A', () => {
    expect(chooseTier(capable)).toBe('A');
  });

  it('falls to C when there is no WebGL context at all', () => {
    expect(chooseTier(signals({ webglAvailable: false }))).toBe('C');
  });

  it('honours a data-saver preference over everything else', () => {
    // The buyer asked. Overriding that to show a nicer render is not a trade worth
    // making in a market where people watch their allowance (spec 11.2, ADR-0010).
    expect(chooseTier(signals({ saveData: true }))).toBe('C');
  });

  it('falls to C on a software rasteriser, which has a context and cannot use it', () => {
    for (const renderer of [
      'SwiftShader',
      'llvmpipe (LLVM 15.0.7, 256 bits)',
      'Microsoft Basic Render Driver',
      'Mesa/X.org, softpipe',
    ]) {
      expect(chooseTier(signals({ renderer })), renderer).toBe('C');
    }
  });

  it('falls to C when the device cannot hold a tier B texture', () => {
    expect(chooseTier(signals({ maxTextureSize: 512 }))).toBe('C');
    expect(chooseTier(signals({ maxTextureSize: 1024 }))).not.toBe('C');
  });

  it('drops to B rather than A on thin memory, few cores, or a slow benchmark', () => {
    expect(chooseTier(signals({ deviceMemoryGb: 2 }))).toBe('B');
    expect(chooseTier(signals({ hardwareConcurrency: 4 }))).toBe('B');
    expect(chooseTier(signals({ benchmarkMs: 480 }))).toBe('B');
  });

  it('resolves unknown signals to B rather than to the turntable', () => {
    // deviceMemory is Chrome only and the renderer string is often withheld. Treating
    // absence as weakness would put most of Safari on a sprite sheet.
    expect(
      chooseTier(
        signals({
          renderer: undefined,
          deviceMemoryGb: undefined,
          hardwareConcurrency: undefined,
          maxTextureSize: 4096,
        }),
      ),
    ).toBe('B');
  });

  it('does not promote a device to A on partial evidence', () => {
    // A device reaches A by demonstrating it, not by failing to disprove it.
    expect(chooseTier(signals({ deviceMemoryGb: undefined }))).toBe('B');
    expect(chooseTier(signals({ hardwareConcurrency: undefined }))).toBe('B');
  });

  it('still reaches A when only the benchmark is missing', () => {
    // An absent timing is unknown, not slow, and memory and cores already carried it.
    expect(chooseTier(signals({ benchmarkMs: undefined }))).toBe('A');
  });
});

describe('TIER_BUDGET', () => {
  it('matches the ladder in spec 11.2', () => {
    expect(TIER_BUDGET.A).toEqual({
      textureSize: 2048,
      shadows: true,
      baseLod: 1,
      usesTurntable: false,
    });
    expect(TIER_BUDGET.B.shadows).toBe(false);
    expect(TIER_BUDGET.B.textureSize).toBe(1024);
    // Tier C degrades the rendering, not the product (ADR-0010).
    expect(TIER_BUDGET.C.usesTurntable).toBe(true);
  });
});

describe('the tier cache', () => {
  function memory(): Storage & { readonly seen: Map<string, string> } {
    const seen = new Map<string, string>();
    return {
      seen,
      getItem: (key) => seen.get(key) ?? null,
      setItem: (key, value) => {
        seen.set(key, value);
      },
      removeItem: (key) => {
        seen.delete(key);
      },
      clear: () => {
        seen.clear();
      },
      key: () => null,
      length: 0,
    };
  }

  it('round-trips a decision', () => {
    const storage = memory();
    writeCachedTier(storage, 'B');
    expect(readCachedTier(storage)).toBe('B');
  });

  it('ignores a decision made by an older rule set', () => {
    const storage = memory();
    storage.setItem('talla.viewer.tier', JSON.stringify({ version: 0, tier: 'A' }));
    expect(readCachedTier(storage)).toBeUndefined();
  });

  it('ignores anything that is not a tier', () => {
    const storage = memory();
    for (const raw of ['not json', '{}', '{"version":1,"tier":"Z"}', 'null']) {
      storage.setItem('talla.viewer.tier', raw);
      expect(readCachedTier(storage), raw).toBeUndefined();
    }
  });

  it('survives storage that throws, which is a private window', () => {
    const hostile: Storage = {
      getItem: () => {
        throw new Error('access denied');
      },
      setItem: () => {
        throw new Error('access denied');
      },
      removeItem: () => undefined,
      clear: () => undefined,
      key: () => null,
      length: 0,
    };

    // A viewer that fails to start because it could not read a cache would be a
    // self-inflicted outage.
    expect(readCachedTier(hostile)).toBeUndefined();
    expect(() => {
      writeCachedTier(hostile, 'A');
    }).not.toThrow();
  });
});
