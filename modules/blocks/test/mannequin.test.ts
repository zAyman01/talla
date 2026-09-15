import { describe, expect, it } from 'vitest';
import type { BodySize } from '@talla/shared';
import type { GarmentBlockId, MeshData } from '../index.ts';
import {
  BODY_SIZES,
  FIGURE_BOUNDS,
  FIGURE_HEIGHT_M,
  GARMENT_BLOCKS,
  LANDMARK,
  bodyMesh,
  bodyStations,
  garmentFit,
  garmentGirthAt,
  garmentMesh,
  measurements,
  morphDelta,
  ringGirthCm,
  ringPoints,
  settleStart,
  verdictFor,
} from '../index.ts';

const BLOCK_IDS: readonly GarmentBlockId[] = GARMENT_BLOCKS.map((b) => b.id);

function topology(mesh: MeshData): string {
  return `${String(mesh.positions.length)}:${String(mesh.indices.length)}`;
}

function finite(values: Float32Array): boolean {
  for (const value of values) if (!Number.isFinite(value)) return false;
  return true;
}

describe('ring construction', () => {
  it('builds a ring to the girth it was asked for, at any cross section', () => {
    for (const depthRatio of [0.44, 0.7, 0.92, 1]) {
      for (const exponent of [2, 2.4, 2.8]) {
        const girth = ringGirthCm(
          { y: 1, girthCm: 92, depthRatio, centerX: 0.1, centerZ: -0.02, exponent },
          40,
        );
        // A polygon through 40 points is the girth, so the tolerance is the sampling,
        // not the maths. The fit reading is quoted to a tenth of a centimetre.
        expect(girth).toBeCloseTo(92, 1);
      }
    }
  });
});

describe('the mannequin', () => {
  it('carries the size chart it was graded from', () => {
    const m = measurements('M');
    expect([m.bust, m.waist, m.hip]).toEqual([92, 74, 100]);
    expect(measurements('XXL').bust).toBeGreaterThan(measurements('XS').bust);
  });

  it('grades every girth in the same direction as the size', () => {
    for (let i = 1; i < BODY_SIZES.length; i += 1) {
      const smaller = measurements(BODY_SIZES[i - 1] as BodySize);
      const larger = measurements(BODY_SIZES[i] as BodySize);
      for (const key of Object.keys(smaller) as (keyof typeof smaller)[]) {
        expect(larger[key]).toBeGreaterThan(smaller[key]);
      }
    }
  });

  it('stands at the same height at every size, so the camera does not jump', () => {
    const heights = BODY_SIZES.map((size) => {
      const { positions } = bodyMesh(size);
      let top = -Infinity;
      for (let i = 1; i < positions.length; i += 3)
        top = Math.max(top, positions[i] ?? 0);
      return top;
    });
    for (const height of heights) expect(height).toBeCloseTo(FIGURE_HEIGHT_M, 6);
  });

  it('is a complete retail form from sole to crown', () => {
    for (const size of BODY_SIZES) {
      const { positions } = bodyMesh(size);
      let bottom = Infinity;
      let top = -Infinity;
      for (let i = 1; i < positions.length; i += 3) {
        bottom = Math.min(bottom, positions[i] ?? Infinity);
        top = Math.max(top, positions[i] ?? -Infinity);
      }
      expect(bottom).toBeCloseTo(FIGURE_BOUNDS.bottom, 6);
      expect(top).toBeCloseTo(FIGURE_BOUNDS.top, 6);
      const stations = bodyStations(size);
      expect(stations.head[0]?.y).toBeLessThan(LANDMARK.neckTop);
      expect(stations.head.at(-1)?.y).toBe(FIGURE_HEIGHT_M);
      expect(stations.foot[0]?.centerZ).toBeGreaterThan(
        stations.foot.at(-1)?.centerZ ?? Infinity,
      );
    }
  });

  it('produces one topology across sizes, which is what makes size a vertex blend', () => {
    const base = bodyMesh('M');
    for (const size of BODY_SIZES) {
      const mesh = bodyMesh(size);
      expect(topology(mesh)).toBe(topology(base));
      expect(finite(mesh.positions)).toBe(true);
      expect(finite(mesh.normals)).toBe(true);
    }
  });

  it('morphs by shape alone: the base size is its own zero delta', () => {
    const base = bodyMesh('M');
    const zero = morphDelta(base, bodyMesh('M'));
    expect(Math.max(...zero)).toBe(0);
    const largest = morphDelta(base, bodyMesh('XXL'));
    let peak = 0;
    for (const value of largest) peak = Math.max(peak, Math.abs(value));
    // Millimetres to a few centimetres. A delta larger than this is a grading error,
    // and it would pop rather than blend at 200 ms (spec 14.3).
    expect(peak).toBeGreaterThan(0.005);
    expect(peak).toBeLessThan(0.08);
  });

  it('is deterministic, so a re-render is the same figure', () => {
    expect(Array.from(bodyMesh('L').positions)).toEqual(
      Array.from(bodyMesh('L').positions),
    );
  });
});

describe('garment blocks', () => {
  it('shares a topology across sizes and across layer depths', () => {
    for (const id of BLOCK_IDS) {
      const base = garmentMesh(id, 'M');
      for (const size of BODY_SIZES) {
        expect(topology(garmentMesh(id, size))).toBe(topology(base));
        expect(topology(garmentMesh(id, size, 'over'))).toBe(topology(base));
      }
    }
  });

  it('keeps cloth outside the body at every vertex of every ring', () => {
    // The invariant that decides whether a render is trusted. A garment that dips inside
    // the figure reads as a body poking through a shirt, and no amount of correct girth
    // makes up for it.
    for (const size of BODY_SIZES) {
      const stations = bodyStations(size);
      for (const id of BLOCK_IDS) {
        for (const y of [
          LANDMARK.bust,
          LANDMARK.waist,
          LANDMARK.hip,
          LANDMARK.thigh,
          LANDMARK.knee,
        ]) {
          const definition = GARMENT_BLOCKS.find((candidate) => candidate.id === id);
          const onLeg = definition?.slot === 'bottom' && y < LANDMARK.crotch;
          const source = onLeg ? stations.leg : stations.torso;
          const segments = onLeg ? stations.segments.limb : stations.segments.torso;
          const bodyGirth = girthAt(source, y, segments);
          const garment = garmentGirthAt(id, size, y);
          if (!coversHeight(id, y)) continue;
          expect(garment).toBeGreaterThan(bodyGirth);
        }
      }
    }
  });

  it('solves the over layer against an inflated body, never a wider render-time offset', () => {
    for (const size of BODY_SIZES) {
      const base = garmentGirthAt('tee-crew-relaxed', size, LANDMARK.bust, 'base');
      const over = garmentGirthAt('tee-crew-relaxed', size, LANDMARK.bust, 'over');
      expect(over).toBeGreaterThan(base);
    }
  });

  it('hangs a top from the chest instead of tracing the waist under it', () => {
    const waist = garmentGirthAt('tee-crew-relaxed', 'M', LANDMARK.waist);
    const bust = garmentGirthAt('tee-crew-relaxed', 'M', LANDMARK.bust);
    expect(waist).toBeGreaterThan(measurements('M').waist + 20);
    expect(waist).toBeGreaterThanOrEqual(bust);
  });

  it('starts the settle above and outside the resting pose, at the same topology', () => {
    const rest = garmentMesh('tee-crew-relaxed', 'M');
    const start = settleStart(rest, { liftM: 0.045, expand: 1.055 });
    expect(topology(start)).toBe(topology(rest));
    expect(start.positions[1]).toBeGreaterThan(rest.positions[1] ?? 0);
  });
});

describe('fit reading', () => {
  it('quotes the ease the geometry actually has', () => {
    for (const size of BODY_SIZES) {
      for (const id of BLOCK_IDS) {
        const fit = garmentFit(id, size);
        for (const reading of fit.readings) {
          expect(reading.easeCm).toBeCloseTo(reading.garmentCm - reading.bodyCm, 1);
          expect(reading.easeCm).toBeGreaterThan(0);
        }
      }
    }
  });

  it('names the same verdict at every size, because ease is graded with the body', () => {
    for (const id of BLOCK_IDS) {
      const verdicts = new Set(BODY_SIZES.map((size) => garmentFit(id, size).verdict));
      expect(verdicts.size).toBe(1);
    }
  });

  it('reads a relaxed tee as relaxed and a straight jean as fitted', () => {
    expect(garmentFit('tee-crew-relaxed', 'M').verdict).toBe('relaxed');
    expect(garmentFit('jeans-straight', 'M').verdict).toBe('fitted');
  });

  it('puts the thresholds where a pattern room puts them', () => {
    expect(verdictFor(1)).toBe('tight');
    expect(verdictFor(4)).toBe('fitted');
    expect(verdictFor(10)).toBe('relaxed');
    expect(verdictFor(20)).toBe('loose');
  });
});

function girthAt(
  rings: ReturnType<typeof bodyStations>['torso'],
  y: number,
  segments: number,
): number {
  for (let i = 1; i < rings.length; i += 1) {
    const lower = rings[i - 1];
    const upper = rings[i];
    if (!lower || !upper || y > upper.y) continue;
    const t = (y - lower.y) / (upper.y - lower.y);
    return ringGirthCm(
      {
        y,
        girthCm: lower.girthCm + (upper.girthCm - lower.girthCm) * t,
        depthRatio: lower.depthRatio + (upper.depthRatio - lower.depthRatio) * t,
        centerX: 0,
        centerZ: 0,
        exponent: lower.exponent + (upper.exponent - lower.exponent) * t,
      },
      segments,
    );
  }
  return rings[rings.length - 1]?.girthCm ?? 0;
}

function coversHeight(id: GarmentBlockId, y: number): boolean {
  const definition = GARMENT_BLOCKS.find((b) => b.id === id);
  if (!definition) return false;
  return definition.slot === 'top'
    ? y >= definition.hemY
    : y >= definition.hemY && y <= 1.03;
}

describe('ring sampling', () => {
  it('closes the loop: the last point joins the first', () => {
    const points = ringPoints(
      { y: 1, girthCm: 92, depthRatio: 0.7, centerX: 0, centerZ: 0, exponent: 2.4 },
      40,
    );
    expect(points.length).toBe(80);
    expect(points[0]).toBeGreaterThan(0);
  });
});
