import type { TrialEvidence } from './index.ts';

function object(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new Error('Invalid trial evidence');
  return value as Record<string, unknown>;
}
function lab(value: unknown): void {
  if (value === null) return;
  const v = object(value);
  for (const k of ['L', 'a', 'b'])
    if (typeof v[k] !== 'number' || !Number.isFinite(v[k]))
      throw new Error('Invalid color measurement');
  const lightness = v['L'] as number;
  if (lightness < 0 || lightness > 100) throw new Error('Invalid color measurement');
}
/** Validate operator-authored JSON before it can influence a release gate. */
export function parseTrialEvidence(value: unknown): TrialEvidence {
  const input = object(value);
  if (
    !Array.isArray(input['garments']) ||
    !Array.isArray(input['deviceRuns']) ||
    !['confirmed', 'rejected', 'pending'].includes(String(input['typography']))
  )
    throw new Error('Invalid trial evidence');
  for (const value of input['garments'] as unknown[]) {
    const garment = object(value);
    if (
      typeof garment['garmentId'] !== 'string' ||
      typeof garment['storeId'] !== 'string' ||
      !['real-store', 'reference', 'synthetic'].includes(String(garment['source'])) ||
      (garment['ownerWouldPublish'] !== null &&
        typeof garment['ownerWouldPublish'] !== 'boolean')
    )
      throw new Error('Invalid garment observation');
    lab(garment['physicalLab']);
    lab(garment['renderedLab']);
  }
  for (const value of input['deviceRuns'] as unknown[]) {
    const run = object(value);
    if (
      typeof run['device'] !== 'string' ||
      typeof run['browser'] !== 'string' ||
      typeof run['physical'] !== 'boolean' ||
      !['cold', 'warm'].includes(String(run['cache'])) ||
      typeof run['ttfdMs'] !== 'number' ||
      !Number.isFinite(run['ttfdMs']) ||
      run['ttfdMs'] <= 0
    )
      throw new Error('Invalid device timing');
  }
  return value as TrialEvidence;
}
