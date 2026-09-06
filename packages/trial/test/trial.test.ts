import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { deltaE00, evaluateTrial, percentile } from '../src/index.ts';
import type { TrialEvidence } from '../src/index.ts';

it('matches all 34 published Sharma CIEDE2000 reference pairs', () => {
  const lines = readFileSync(new URL('../fixtures/ciede2000.txt', import.meta.url), 'utf8').trim().split(/\r?\n/);
  expect(lines).toHaveLength(34);
  for (const line of lines) {
    const [L1, a1, b1, L2, a2, b2, expected] = line.trim().split(/\s+/).map(Number);
    if (L1 === undefined || a1 === undefined || b1 === undefined || L2 === undefined || a2 === undefined || b2 === undefined || expected === undefined) throw new Error('Broken reference pair');
    expect(deltaE00({ L: L1, a: a1, b: b1 }, { L: L2, a: a2, b: b2 })).toBeCloseTo(expected, 4);
  }
});
function complete(): TrialEvidence {
  return { garments: Array.from({ length: 50 }, (_, i) => ({ garmentId: String(i), storeId: String(i % 3), source: 'real-store', ownerWouldPublish: i < 35,
    physicalLab: { L: 50, a: 0, b: 0 }, renderedLab: { L: 51, a: 0, b: 0 } })),
    deviceRuns: Array.from({ length: 20 }, (_, i) => ({ device: 'Samsung Galaxy A16 4GB', browser: 'Instagram', physical: true,
      cache: i < 10 ? 'cold' : 'warm', ttfdMs: i < 10 ? 3500 : 700 })), typography: 'confirmed' };
}
it('never passes missing evidence, web references or simulated phones', () => {
  expect(evaluateTrial({ garments: [], deviceRuns: [], typography: 'pending' }).passed).toBe(false);
  const real = complete();
  expect(evaluateTrial(real).passed).toBe(true);
  expect(evaluateTrial({ ...real, garments: real.garments.map((g) => ({ ...g, source: 'reference' })) }).passed).toBe(false);
  expect(evaluateTrial({ ...real, deviceRuns: real.deviceRuns.map((r) => ({ ...r, physical: false })) }).passed).toBe(false);
  expect(evaluateTrial({ ...real, garments: real.garments.map((g) => ({ ...g, physicalLab: null })) }).passed).toBe(false);
});
it('rejects duplicate garments and invalid timings rather than inflating a trial', () => {
  const real = complete();
  expect(() => evaluateTrial({ ...real, garments: [...real.garments, ...real.garments] })).toThrow('duplicate');
  expect(() => evaluateTrial({ ...real, deviceRuns: real.deviceRuns.map((r) => ({ ...r, ttfdMs: NaN })) })).toThrow('timing');
  expect(percentile([1, 3, 2, 4], 0.5)).toBe(2.5);
});
