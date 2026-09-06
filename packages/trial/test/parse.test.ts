import { expect, it } from 'vitest';
import { parseTrialEvidence } from '../src/parse.ts';
it('rejects stringified booleans and absent measurement fields', () => {
  const observation = {
    garmentId: 'one',
    storeId: 'store',
    source: 'real-store',
    ownerWouldPublish: 'yes',
    physicalLab: null,
    renderedLab: null,
  };
  expect(() =>
    parseTrialEvidence({
      garments: [observation],
      deviceRuns: [],
      typography: 'confirmed',
    }),
  ).toThrow();
  expect(() =>
    parseTrialEvidence({
      garments: [{ ...observation, ownerWouldPublish: true, physicalLab: undefined }],
      deviceRuns: [],
      typography: 'confirmed',
    }),
  ).toThrow();
  expect(
    parseTrialEvidence({ garments: [], deviceRuns: [], typography: 'pending' })
      .typography,
  ).toBe('pending');
});
