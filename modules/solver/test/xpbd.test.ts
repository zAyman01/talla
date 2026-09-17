import { describe, expect, it } from 'vitest';
import type { Block, FabricPreset } from '@talla/blocks';
import type { GarmentSpec } from '@talla/garment-spec';
import { createSolver } from '../index.ts';

const mockBlock: Block = {
  id: 'tee-crew-relaxed',
  version: '1.0.0',
  category: 'tee',
  meshSha256: 'mock-mesh-sha',
  uvLayoutSha256: 'mock-uv-sha',
};

const mockFabric: FabricPreset = {
  id: 'cotton-jersey',
  bendStiffness: 0.12,
  stretchStiffness: 0.35,
  density: 0.18,
};

const mockSpec = {
  spec_version: '1.0.0',
  id: 'test-garment',
  tenant_id: 'tenant-1',
  category: 'tee',
  block_id: 'tee-crew-relaxed',
  block_version: '1.0.0',
  fabric: 'cotton-jersey',
  style: {
    slot: 'top',
    dominant_colors: [{ hex: '#26356B', weight: 1, a: 10, b: -25 }],
    formality: 1,
    volume: 'relaxed',
    pattern_busy: 0,
    season: 'all',
  },
} as unknown as GarmentSpec;

describe('XPBD Cloth Solver', () => {
  it('solves cloth drape deterministically and extracts morph deltas and settle clip', async () => {
    const solver = createSolver();

    const input = {
      spec: mockSpec,
      block: mockBlock,
      fabric: mockFabric,
      baseBody: 'M' as const,
      morphBodies: ['S', 'L'] as const,
    };

    const firstRun = await solver.solve(input);
    expect(firstRun.ok).toBe(true);
    if (!firstRun.ok) return;

    expect(firstRun.value.baseMeshSha256).toHaveLength(64);
    expect(firstRun.value.morphDeltaSha256).toHaveLength(2);
    expect(firstRun.value.settleClipSha256).toHaveLength(64);
    expect(firstRun.value.solveSeconds).toBeGreaterThan(0);

    // Determinism test: second run produces identical hashes
    const secondRun = await solver.solve(input);
    expect(secondRun.ok).toBe(true);
    if (!secondRun.ok) return;

    expect(secondRun.value.baseMeshSha256).toBe(firstRun.value.baseMeshSha256);
    expect(secondRun.value.morphDeltaSha256).toEqual(firstRun.value.morphDeltaSha256);
    expect(secondRun.value.settleClipSha256).toBe(firstRun.value.settleClipSha256);
  });
});
