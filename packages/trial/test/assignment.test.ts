import { expect, it } from 'vitest';
import { assignExperiment } from '../src/assignment.ts';
it('keeps device assignment sticky and separates tenant and experiment identities', () => {
  const secret = new Uint8Array(32).fill(7);
  const a = assignExperiment(secret, 'pilot-1', 'store-a', 'random-device-id');
  expect(assignExperiment(secret, 'pilot-1', 'store-a', 'random-device-id')).toEqual(a);
  expect(
    assignExperiment(secret, 'pilot-1', 'store-b', 'random-device-id').pseudonym,
  ).not.toBe(a.pseudonym);
  expect(
    assignExperiment(secret, 'pilot-2', 'store-a', 'random-device-id').pseudonym,
  ).not.toBe(a.pseudonym);
  let control = 0;
  for (let i = 0; i < 10000; i++)
    if (assignExperiment(secret, 'pilot-1', 'store-a', String(i)).cohort === 'control')
      control++;
  expect(control).toBeGreaterThan(1800);
  expect(control).toBeLessThan(2200);
});
