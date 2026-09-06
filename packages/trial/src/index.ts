import { deltaE00 } from './color.ts';
import type { Lab } from './color.ts';
export { deltaE00 } from './color.ts';
export type { Lab } from './color.ts';

export interface GarmentObservation {
  readonly garmentId: string;
  readonly storeId: string;
  readonly source: 'real-store' | 'reference' | 'synthetic';
  readonly ownerWouldPublish: boolean | null;
  readonly physicalLab: Lab | null;
  readonly renderedLab: Lab | null;
}
export interface DeviceRun {
  readonly device: string;
  readonly browser: string;
  readonly physical: boolean;
  readonly cache: 'cold' | 'warm';
  readonly ttfdMs: number;
}
export interface TrialEvidence {
  readonly garments: readonly GarmentObservation[];
  readonly deviceRuns: readonly DeviceRun[];
  readonly typography: 'confirmed' | 'rejected' | 'pending';
}
export interface TrialReport {
  readonly passed: boolean;
  readonly realGarments: number;
  readonly realStores: number;
  readonly approvalRate: number | null;
  readonly medianDeltaE00: number | null;
  readonly coldP75Ms: number | null;
  readonly warmP75Ms: number | null;
  readonly blockers: readonly string[];
}

export function percentile(values: readonly number[], fraction: number): number | null {
  if (values.length === 0) return null;
  if (!values.every(Number.isFinite) || !Number.isFinite(fraction) || fraction < 0 || fraction > 1) throw new Error('Invalid percentile input');
  const sorted = [...values].sort((a, b) => a - b);
  const index = (sorted.length - 1) * fraction;
  const low = sorted[Math.floor(index)];
  const high = sorted[Math.ceil(index)];
  if (low === undefined || high === undefined) return null;
  return low + (high - low) * (index % 1);
}

export function evaluateTrial(evidence: TrialEvidence): TrialReport {
  const blockers: string[] = [];
  const ids = new Set<string>();
  for (const g of evidence.garments) {
    const key = `${g.storeId}:${g.garmentId}`;
    if (!g.storeId.trim() || !g.garmentId.trim() || ids.has(key)) throw new Error('Missing or duplicate observation identity');
    ids.add(key);
  }
  const real = evidence.garments.filter((g) => g.source === 'real-store');
  const stores = new Set(real.map((g) => g.storeId));
  if (real.length < 50 || stores.size < 3) blockers.push('50 real garments from at least 3 stores are required');
  const reviewed = real.filter((g) => g.ownerWouldPublish !== null);
  const approval = reviewed.length === 0 ? null : reviewed.filter((g) => g.ownerWouldPublish).length / reviewed.length;
  if (reviewed.length !== real.length || approval === null || approval < 0.7) blockers.push('All garments need owner review with at least 70% approval');
  const colors = real.flatMap((g) => g.physicalLab && g.renderedLab ? [deltaE00(g.physicalLab, g.renderedLab)] : []);
  const median = percentile(colors, 0.5);
  if (colors.length !== real.length || median === null || median >= 3) blockers.push('Every garment needs a physical color measurement; median Delta E00 must be below 3');
  for (const run of evidence.deviceRuns) if (!Number.isFinite(run.ttfdMs) || run.ttfdMs <= 0) throw new Error('Invalid device timing');
  const runs = evidence.deviceRuns.filter((r) => r.physical && r.device === 'Samsung Galaxy A16 4GB' && r.browser === 'Instagram');
  const cold = runs.filter((r) => r.cache === 'cold').map((r) => r.ttfdMs);
  const warm = runs.filter((r) => r.cache === 'warm').map((r) => r.ttfdMs);
  const coldP75 = percentile(cold, 0.75);
  const warmP75 = percentile(warm, 0.75);
  // Ten repeated observations per cache mode is a measurement protocol, not a lab claim.
  if (cold.length < 10 || coldP75 === null || coldP75 >= 4000) blockers.push('10 cold-cache reference-phone runs with p75 below 4000 ms are required');
  if (warm.length < 10 || warmP75 === null || warmP75 >= 800) blockers.push('10 warm-cache reference-phone runs with p75 below 800 ms are required');
  if (evidence.typography !== 'confirmed') blockers.push('Arabic typography needs a recorded review');
  return { passed: blockers.length === 0, realGarments: real.length, realStores: stores.size,
    approvalRate: approval, medianDeltaE00: median, coldP75Ms: coldP75, warmP75Ms: warmP75, blockers };
}
