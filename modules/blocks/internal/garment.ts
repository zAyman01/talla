/**
 * Garment blocks: the shapes a solved garment is snapped to.
 *
 * A block is a body with ease added and a hang rule applied. That is the whole idea. Ease
 * is what makes an M tee read as an M tee rather than as paint on the figure, and the hang
 * rule is what stops a top from tracing the waist it is supposed to fall past.
 *
 * This is not the Dress Solver. No cloth is simulated here, nothing converges, and a
 * gathered hem or a structured shoulder is out of reach. What it does give is a garment
 * whose finished measurements are known numbers, which is what the fit reading needs and
 * what a real solve will have to match when it replaces this (ADR-0018).
 *
 * One rule is enforced rather than assumed: cloth is outside the body at every vertex.
 * Ease is a girth, and a girth can be satisfied while a rounder cross section pulls the
 * side seam inside the figure. That reads as a body poking through a shirt, which is the
 * single fastest way to lose a buyer's trust in a render, so `clothOver` checks the
 * margin per segment instead of trusting the circumference.
 */

import type { BodySize, Slot } from '@talla/shared';
import type { MeshData, Ring } from './geometry.ts';
import { loft, mergeMeshes, ringAtHeight, ringPoints } from './geometry.ts';
import { ARM_LANDMARK, LANDMARK, bodyStations, mirrored } from './body.ts';

export type GarmentBlockId =
  | 'tee-crew-relaxed'
  | 'tee-long-relaxed'
  | 'jeans-straight'
  | 'pants-wide-leg'
  | 'shorts-relaxed'
  | 'dress-midi'
  | 'abaya-open'
  | 'skirt-a-line'
  | 'kaftan-relaxed';

/**
 * Where a garment sits in the stack. `over` is solved against a body inflated by the
 * layer under it, never pushed out at render time: a uniform normal offset self
 * intersects at every concave seam (spec 8).
 */
export type LayerDepth = 'base' | 'over';

/** Thickness a base layer adds to the body it covers, centimetres of girth. */
const BASE_LAYER_GIRTH_CM = 2.4;

/** Cloth never sits inside the body, whatever the ease profile asks for. */
const MINIMUM_CLEARANCE_CM = 2.5;

/** The gap held at every vertex, metres. Below this the two surfaces flicker. */
const MINIMUM_MARGIN_M = 0.004;

/**
 * How far a cloth cross section is rounded off the body's own, 0 to 1.
 *
 * Cloth does not trace a body's flatter front and back, but every point of rounding is
 * paid for in forced widening at the side seam, which shows up as ease the block never
 * asked for. Low enough that a designed ease survives, high enough that a tee is not
 * shrink wrap.
 */
const CLOTH_ROUNDING = 0.12;

export interface FabricPreset {
  readonly id: string;
  readonly bendStiffness: number;
  readonly stretchStiffness: number;
  readonly density: number;
}

const FABRICS: readonly FabricPreset[] = [
  { id: 'cotton-jersey', bendStiffness: 0.12, stretchStiffness: 0.35, density: 0.18 },
  { id: 'denim-rigid', bendStiffness: 0.62, stretchStiffness: 0.88, density: 0.42 },
  { id: 'linen', bendStiffness: 0.35, stretchStiffness: 0.15, density: 0.22 },
  { id: 'silk-viscose', bendStiffness: 0.08, stretchStiffness: 0.1, density: 0.14 },
];

export function fabric(id: string): FabricPreset | undefined {
  return FABRICS.find((preset) => preset.id === id);
}

/** A point the fit reading is taken at, and the body girth it is compared against. */
export interface FitPoint {
  readonly key: 'chest' | 'waist' | 'hip' | 'thigh';
  readonly y: number;
}

export interface GarmentBlockDefinition {
  readonly id: GarmentBlockId;
  readonly version: string;
  readonly slot: Slot;
  readonly category: string;
  readonly fabricId: string;
  /** Where the hem falls, metres above the floor. The viewer frames against it. */
  readonly hemY: number;
  readonly fitPoints: readonly FitPoint[];
}

/** A mid rise, between the natural waist and the high hip. Where straight jeans sit. */
const JEANS_WAISTBAND_Y = 1.03;
const JEANS_HEM_Y = 0.1;
const JEANS_SEAT_BOTTOM_Y = 0.78;
const WIDE_PANTS_HEM_Y = 0.055;
const SHORTS_HEM_Y = 0.56;
const DRESS_MIDI_HEM_Y = 0.45;
const ABAYA_HEM_Y = 0.12;
const SKIRT_HEM_Y = 0.52;
const KAFTAN_HEM_Y = 0.2;

// Six centimetres below the natural waist reads as a crop top once a mid rise jean is
// under it. A tee hem sits on the upper hip.
const TEE_HEM_Y = 0.945;
const TEE_NECK_Y = 1.418;
const SLEEVE_HEM_Y = 1.175;
const LONG_SLEEVE_HEM_Y = 0.81;

export const GARMENT_BLOCKS: readonly GarmentBlockDefinition[] = [
  {
    id: 'tee-crew-relaxed',
    version: '1.0.0',
    slot: 'top',
    category: 'tee',
    fabricId: 'cotton-jersey',
    hemY: TEE_HEM_Y,
    fitPoints: [
      { key: 'chest', y: LANDMARK.bust },
      { key: 'hip', y: TEE_HEM_Y },
    ],
  },
  {
    id: 'tee-long-relaxed',
    version: '1.0.0',
    slot: 'top',
    category: 'long-sleeve-top',
    fabricId: 'cotton-jersey',
    hemY: TEE_HEM_Y,
    fitPoints: [
      { key: 'chest', y: LANDMARK.bust },
      { key: 'hip', y: TEE_HEM_Y },
    ],
  },
  {
    id: 'jeans-straight',
    version: '1.0.0',
    slot: 'bottom',
    category: 'jeans',
    fabricId: 'denim-rigid',
    hemY: JEANS_HEM_Y,
    fitPoints: [
      { key: 'waist', y: JEANS_WAISTBAND_Y },
      { key: 'hip', y: LANDMARK.hip },
      { key: 'thigh', y: LANDMARK.thigh },
    ],
  },
  {
    id: 'pants-wide-leg',
    version: '1.0.0',
    slot: 'bottom',
    category: 'wide-leg-pants',
    fabricId: 'cotton-jersey',
    hemY: WIDE_PANTS_HEM_Y,
    fitPoints: [
      { key: 'waist', y: JEANS_WAISTBAND_Y },
      { key: 'hip', y: LANDMARK.hip },
      { key: 'thigh', y: LANDMARK.thigh },
    ],
  },
  {
    id: 'shorts-relaxed',
    version: '1.0.0',
    slot: 'bottom',
    category: 'shorts',
    fabricId: 'cotton-jersey',
    hemY: SHORTS_HEM_Y,
    fitPoints: [
      { key: 'waist', y: JEANS_WAISTBAND_Y },
      { key: 'hip', y: LANDMARK.hip },
      { key: 'thigh', y: LANDMARK.thigh },
    ],
  },
  {
    id: 'dress-midi',
    version: '1.0.0',
    slot: 'top',
    category: 'dress',
    fabricId: 'linen',
    hemY: DRESS_MIDI_HEM_Y,
    fitPoints: [
      { key: 'chest', y: LANDMARK.bust },
      { key: 'waist', y: LANDMARK.waist },
      { key: 'hip', y: LANDMARK.hip },
    ],
  },
  {
    id: 'abaya-open',
    version: '1.0.0',
    slot: 'outer',
    category: 'abaya',
    fabricId: 'silk-viscose',
    hemY: ABAYA_HEM_Y,
    fitPoints: [
      { key: 'chest', y: LANDMARK.bust },
      { key: 'waist', y: LANDMARK.waist },
      { key: 'hip', y: LANDMARK.hip },
    ],
  },
  {
    id: 'skirt-a-line',
    version: '1.0.0',
    slot: 'bottom',
    category: 'skirt',
    fabricId: 'linen',
    hemY: SKIRT_HEM_Y,
    fitPoints: [
      { key: 'waist', y: JEANS_WAISTBAND_Y },
      { key: 'hip', y: LANDMARK.hip },
    ],
  },
  {
    id: 'kaftan-relaxed',
    version: '1.0.0',
    slot: 'top',
    category: 'kaftan',
    fabricId: 'silk-viscose',
    hemY: KAFTAN_HEM_Y,
    fitPoints: [
      { key: 'chest', y: LANDMARK.bust },
      { key: 'waist', y: LANDMARK.waist },
      { key: 'hip', y: LANDMARK.hip },
    ],
  },
];

export function block(id: GarmentBlockId): GarmentBlockDefinition | undefined {
  return GARMENT_BLOCKS.find((candidate) => candidate.id === id);
}

/** Girth of the body under a garment, allowing for anything already worn beneath it. */
function underGirth(base: number, layer: LayerDepth): number {
  return layer === 'over' ? base + BASE_LAYER_GIRTH_CM : base;
}

/** Radii of a ring's vertices from its own centre, metres. */
function radii(ring: Ring, segments: number): Float64Array {
  const points = ringPoints(ring, segments);
  const out = new Float64Array(segments);
  for (let i = 0; i < segments; i += 1) {
    out[i] = Math.hypot(
      (points[i * 2] ?? 0) - ring.centerX,
      (points[i * 2 + 1] ?? 0) - ring.centerZ,
    );
  }
  return out;
}

/**
 * A cloth ring over a body ring, at the requested finished girth or wider.
 *
 * Cloth is rounder and softer than the body it covers, which changes the cross section's
 * proportions. That alone can leave a side seam inside the figure at the same
 * circumference, so the ring is widened until every vertex clears the body by
 * `MINIMUM_MARGIN_M`. The returned girth is the girth actually used, and the fit reading
 * is taken from it, so the number beside the viewer is the garment on screen.
 */
function clothOver(
  body: Ring,
  targetGirthCm: number,
  segments: number,
  layer: LayerDepth,
): Ring {
  const inflated: Ring =
    layer === 'over' ? { ...body, girthCm: body.girthCm + BASE_LAYER_GIRTH_CM } : body;
  const candidate: Ring = {
    y: body.y,
    girthCm: targetGirthCm,
    depthRatio: body.depthRatio + (1 - body.depthRatio) * CLOTH_ROUNDING,
    centerX: body.centerX,
    centerZ: body.centerZ * 0.6,
    exponent: body.exponent + 0.1,
  };
  const bodyRadii = radii(inflated, segments);
  const clothRadii = radii(candidate, segments);
  let scale = 1;
  for (let i = 0; i < segments; i += 1) {
    const cloth = clothRadii[i] ?? 0;
    if (cloth <= 0) continue;
    const needed = ((bodyRadii[i] ?? 0) + MINIMUM_MARGIN_M) / cloth;
    if (needed > scale) scale = needed;
  }
  return scale > 1 ? { ...candidate, girthCm: candidate.girthCm * scale } : candidate;
}

interface HangRule {
  /** Height the garment takes its width from, metres. */
  readonly supportY: number;
  /** Ease at the support, centimetres of girth. */
  readonly supportEaseCm: number;
  /** How much the silhouette opens out below the support, centimetres per metre. */
  readonly flareCmPerM: number;
}

interface EaseStop {
  readonly y: number;
  readonly easeCm: number;
}

function easeAt(stops: readonly EaseStop[], y: number): number {
  const first = stops[0];
  const last = stops[stops.length - 1];
  if (!first || !last) return 0;
  if (y <= first.y) return first.easeCm;
  if (y >= last.y) return last.easeCm;
  for (let i = 1; i < stops.length; i += 1) {
    const lower = stops[i - 1];
    const upper = stops[i];
    if (!lower || !upper || y > upper.y) continue;
    const t = (y - lower.y) / (upper.y - lower.y);
    return lower.easeCm + (upper.easeCm - lower.easeCm) * t;
  }
  return last.easeCm;
}

interface Panel {
  readonly heights: readonly number[];
  readonly stations: readonly Ring[];
  readonly ease: readonly EaseStop[];
  readonly segments: number;
  /** Omit for a garment that follows the body all the way down, such as a trouser leg. */
  readonly hang?: HangRule;
}

/**
 * Finished rings for one panel.
 *
 * Above the hang support the garment follows the body plus its ease. Below it the garment
 * hangs: it keeps the support's width and flares slightly, and never narrows to a waist it
 * is meant to fall past.
 */
function panelRings(panel: Panel, layer: LayerDepth): readonly Ring[] {
  const support = panel.hang
    ? ringAtHeight(panel.stations, panel.hang.supportY)
    : undefined;
  return panel.heights.map((y) => {
    const body = ringAtHeight(panel.stations, y);
    const under = underGirth(body.girthCm, layer);
    const followed = under + easeAt(panel.ease, y);
    const floor = under + MINIMUM_CLEARANCE_CM;
    let target = Math.max(followed, floor);
    if (panel.hang && support && y < panel.hang.supportY) {
      const hanging =
        underGirth(support.girthCm, layer) +
        panel.hang.supportEaseCm +
        (panel.hang.supportY - y) * panel.hang.flareCmPerM;
      target = Math.max(target, hanging);
    }
    return clothOver(body, target, panel.segments, layer);
  });
}

const TEE_EASE: readonly EaseStop[] = [
  { y: 1.0, easeCm: 10 },
  { y: LANDMARK.waist, easeCm: 10 },
  { y: LANDMARK.bust, easeCm: 10 },
  { y: LANDMARK.chest, easeCm: 9 },
  { y: LANDMARK.shoulder, easeCm: 6 },
  { y: LANDMARK.neckBase, easeCm: 4 },
];

const TEE_HANG: HangRule = {
  supportY: LANDMARK.bust,
  supportEaseCm: 10,
  flareCmPerM: 4,
};

const SLEEVE_EASE: readonly EaseStop[] = [
  { y: SLEEVE_HEM_Y, easeCm: 7 },
  { y: ARM_LANDMARK.armTop, easeCm: 6 },
];

const LONG_SLEEVE_EASE: readonly EaseStop[] = [
  { y: LONG_SLEEVE_HEM_Y, easeCm: 5 },
  { y: ARM_LANDMARK.forearm, easeCm: 7 },
  { y: ARM_LANDMARK.elbow, easeCm: 8 },
  { y: ARM_LANDMARK.armTop, easeCm: 7 },
];

const JEANS_EASE: readonly EaseStop[] = [
  { y: LANDMARK.ankle, easeCm: 14 },
  { y: LANDMARK.knee, easeCm: 9 },
  { y: LANDMARK.thigh, easeCm: 6 },
  { y: LANDMARK.crotch, easeCm: 6 },
  { y: LANDMARK.hip, easeCm: 4 },
  { y: JEANS_WAISTBAND_Y, easeCm: 2 },
];

const WIDE_LEG_EASE: readonly EaseStop[] = [
  { y: WIDE_PANTS_HEM_Y, easeCm: 24 },
  { y: LANDMARK.lowerCalf, easeCm: 22 },
  { y: LANDMARK.knee, easeCm: 18 },
  { y: LANDMARK.thigh, easeCm: 13 },
  { y: LANDMARK.crotch, easeCm: 10 },
  { y: LANDMARK.hip, easeCm: 7 },
  { y: JEANS_WAISTBAND_Y, easeCm: 4 },
];

const SHORTS_EASE: readonly EaseStop[] = [
  { y: SHORTS_HEM_Y, easeCm: 15 },
  { y: LANDMARK.thigh, easeCm: 11 },
  { y: LANDMARK.crotch, easeCm: 9 },
  { y: LANDMARK.hip, easeCm: 7 },
  { y: JEANS_WAISTBAND_Y, easeCm: 4 },
];

const JEANS_HANG: HangRule = {
  supportY: JEANS_WAISTBAND_Y,
  supportEaseCm: 2,
  flareCmPerM: 0,
};

const DRESS_EASE: readonly EaseStop[] = [
  { y: DRESS_MIDI_HEM_Y, easeCm: 28 },
  { y: LANDMARK.midThigh, easeCm: 20 },
  { y: LANDMARK.hip, easeCm: 14 },
  { y: LANDMARK.waist, easeCm: 10 },
  { y: LANDMARK.bust, easeCm: 9 },
  { y: LANDMARK.chest, easeCm: 8 },
  { y: LANDMARK.shoulder, easeCm: 6 },
  { y: LANDMARK.neckBase, easeCm: 4 },
];

const DRESS_HANG: HangRule = {
  supportY: LANDMARK.bust,
  supportEaseCm: 9,
  flareCmPerM: 18,
};

const ABAYA_EASE: readonly EaseStop[] = [
  { y: ABAYA_HEM_Y, easeCm: 36 },
  { y: LANDMARK.knee, easeCm: 30 },
  { y: LANDMARK.hip, easeCm: 22 },
  { y: LANDMARK.waist, easeCm: 20 },
  { y: LANDMARK.bust, easeCm: 16 },
  { y: LANDMARK.chest, easeCm: 14 },
  { y: LANDMARK.shoulder, easeCm: 10 },
  { y: LANDMARK.neckBase, easeCm: 6 },
];

const ABAYA_HANG: HangRule = {
  supportY: LANDMARK.bust,
  supportEaseCm: 16,
  flareCmPerM: 20,
};

const ABAYA_SLEEVE_EASE: readonly EaseStop[] = [
  { y: ARM_LANDMARK.wrist, easeCm: 14 },
  { y: ARM_LANDMARK.forearm, easeCm: 15 },
  { y: ARM_LANDMARK.elbow, easeCm: 14 },
  { y: ARM_LANDMARK.upperArm, easeCm: 12 },
  { y: ARM_LANDMARK.armTop, easeCm: 10 },
];

const SKIRT_EASE: readonly EaseStop[] = [
  { y: SKIRT_HEM_Y, easeCm: 26 },
  { y: LANDMARK.midThigh, easeCm: 18 },
  { y: LANDMARK.thigh, easeCm: 14 },
  { y: LANDMARK.crotch, easeCm: 10 },
  { y: LANDMARK.hip, easeCm: 7 },
  { y: LANDMARK.highHip, easeCm: 5 },
  { y: JEANS_WAISTBAND_Y, easeCm: 4 },
];

const SKIRT_HANG: HangRule = {
  supportY: JEANS_WAISTBAND_Y,
  supportEaseCm: 4,
  flareCmPerM: 35,
};

const KAFTAN_EASE: readonly EaseStop[] = [
  { y: KAFTAN_HEM_Y, easeCm: 40 },
  { y: LANDMARK.knee, easeCm: 32 },
  { y: LANDMARK.hip, easeCm: 24 },
  { y: LANDMARK.waist, easeCm: 22 },
  { y: LANDMARK.bust, easeCm: 18 },
  { y: LANDMARK.chest, easeCm: 15 },
  { y: LANDMARK.shoulder, easeCm: 12 },
  { y: LANDMARK.neckBase, easeCm: 7 },
];

const KAFTAN_HANG: HangRule = {
  supportY: LANDMARK.bust,
  supportEaseCm: 18,
  flareCmPerM: 22,
};

const KAFTAN_SLEEVE_EASE: readonly EaseStop[] = [
  { y: ARM_LANDMARK.forearm, easeCm: 16 },
  { y: ARM_LANDMARK.elbow, easeCm: 15 },
  { y: ARM_LANDMARK.upperArm, easeCm: 13 },
  { y: ARM_LANDMARK.armTop, easeCm: 10 },
];

/** The finished panels of a garment, in the order they are lofted. */
interface GarmentPanels {
  /** The panel that covers the torso or the seat. Fit readings above the crotch use it. */
  readonly trunk: readonly Ring[];
  /** One limb panel: a sleeve or a trouser leg, mirrored to the other side. */
  readonly limb: readonly Ring[];
  readonly trunkSegments: number;
  readonly limbSegments: number;
  /** Whether the trunk's top ring closes the loft, as a tee's neckline does. */
  readonly trunkCapEnd: boolean;
}

function teePanels(size: BodySize, layer: LayerDepth, longSleeve = false): GarmentPanels {
  const stations = bodyStations(size);
  const { torso, limb } = stations.segments;
  const body = panelRings(
    {
      heights: [
        TEE_HEM_Y,
        LANDMARK.highHip,
        LANDMARK.waist,
        LANDMARK.underBust,
        LANDMARK.bust,
        LANDMARK.chest,
        LANDMARK.shoulder,
        LANDMARK.shoulderTop,
      ],
      stations: stations.torso,
      ease: TEE_EASE,
      segments: torso,
      hang: TEE_HANG,
    },
    layer,
  );
  const neckBody = ringAtHeight(stations.torso, TEE_NECK_Y);
  const neck = clothOver(neckBody, neckBody.girthCm * 1.2, torso, 'base');
  const sleeve = panelRings(
    {
      heights: longSleeve
        ? [
            LONG_SLEEVE_HEM_Y,
            0.87,
            ARM_LANDMARK.forearm,
            ARM_LANDMARK.elbow,
            1.16,
            1.28,
            ARM_LANDMARK.armTop,
          ]
        : [SLEEVE_HEM_Y, 1.28, ARM_LANDMARK.armTop],
      stations: stations.arm,
      ease: longSleeve ? LONG_SLEEVE_EASE : SLEEVE_EASE,
      segments: limb,
    },
    layer,
  );
  return {
    trunk: [...body, neck],
    limb: sleeve,
    trunkSegments: torso,
    limbSegments: limb,
    trunkCapEnd: false,
  };
}

function bottomPanels(
  size: BodySize,
  layer: LayerDepth,
  kind: 'straight' | 'wide' | 'shorts',
): GarmentPanels {
  const stations = bodyStations(size);
  const { torso, limb } = stations.segments;
  const hemY =
    kind === 'wide' ? WIDE_PANTS_HEM_Y : kind === 'shorts' ? SHORTS_HEM_Y : JEANS_HEM_Y;
  const ease =
    kind === 'wide' ? WIDE_LEG_EASE : kind === 'shorts' ? SHORTS_EASE : JEANS_EASE;
  const seat = panelRings(
    {
      heights: [
        JEANS_SEAT_BOTTOM_Y,
        LANDMARK.crotch,
        LANDMARK.hip,
        LANDMARK.highHip,
        JEANS_WAISTBAND_Y,
      ],
      stations: stations.torso,
      ease,
      segments: torso,
      hang: JEANS_HANG,
    },
    layer,
  );
  const legHeights =
    kind === 'shorts'
      ? [SHORTS_HEM_Y, LANDMARK.midThigh, LANDMARK.thigh, LANDMARK.hip]
      : [
          hemY,
          LANDMARK.lowerCalf,
          LANDMARK.calf,
          LANDMARK.knee,
          LANDMARK.midThigh,
          LANDMARK.thigh,
          LANDMARK.hip,
        ];
  const leg = panelRings(
    {
      heights: legHeights,
      stations: stations.leg,
      ease,
      segments: limb,
    },
    layer,
  );
  return {
    trunk: seat,
    limb: leg,
    trunkSegments: torso,
    limbSegments: limb,
    trunkCapEnd: false,
  };
}

function dressPanels(size: BodySize, layer: LayerDepth): GarmentPanels {
  const stations = bodyStations(size);
  const { torso, limb } = stations.segments;
  const body = panelRings(
    {
      heights: [
        DRESS_MIDI_HEM_Y,
        LANDMARK.aboveKnee,
        LANDMARK.midThigh,
        LANDMARK.crotch,
        LANDMARK.hip,
        LANDMARK.highHip,
        LANDMARK.waist,
        LANDMARK.underBust,
        LANDMARK.bust,
        LANDMARK.chest,
        LANDMARK.shoulder,
        LANDMARK.shoulderTop,
      ],
      stations: stations.torso,
      ease: DRESS_EASE,
      segments: torso,
      hang: DRESS_HANG,
    },
    layer,
  );
  const neckBody = ringAtHeight(stations.torso, TEE_NECK_Y);
  const neck = clothOver(neckBody, neckBody.girthCm * 1.15, torso, 'base');
  const sleeve = panelRings(
    {
      heights: [SLEEVE_HEM_Y, 1.28, ARM_LANDMARK.armTop],
      stations: stations.arm,
      ease: SLEEVE_EASE,
      segments: limb,
    },
    layer,
  );
  return {
    trunk: [...body, neck],
    limb: sleeve,
    trunkSegments: torso,
    limbSegments: limb,
    trunkCapEnd: false,
  };
}

function abayaPanels(size: BodySize, layer: LayerDepth): GarmentPanels {
  const stations = bodyStations(size);
  const { torso, limb } = stations.segments;
  const body = panelRings(
    {
      heights: [
        ABAYA_HEM_Y,
        LANDMARK.lowerCalf,
        LANDMARK.calf,
        LANDMARK.knee,
        LANDMARK.midThigh,
        LANDMARK.crotch,
        LANDMARK.hip,
        LANDMARK.highHip,
        LANDMARK.waist,
        LANDMARK.underBust,
        LANDMARK.bust,
        LANDMARK.chest,
        LANDMARK.shoulder,
        LANDMARK.shoulderTop,
      ],
      stations: stations.torso,
      ease: ABAYA_EASE,
      segments: torso,
      hang: ABAYA_HANG,
    },
    layer,
  );
  const neckBody = ringAtHeight(stations.torso, TEE_NECK_Y);
  const neck = clothOver(neckBody, neckBody.girthCm * 1.25, torso, 'base');
  const sleeve = panelRings(
    {
      heights: [
        ARM_LANDMARK.wrist,
        0.87,
        ARM_LANDMARK.forearm,
        ARM_LANDMARK.elbow,
        1.16,
        1.28,
        ARM_LANDMARK.armTop,
      ],
      stations: stations.arm,
      ease: ABAYA_SLEEVE_EASE,
      segments: limb,
    },
    layer,
  );
  return {
    trunk: [...body, neck],
    limb: sleeve,
    trunkSegments: torso,
    limbSegments: limb,
    trunkCapEnd: false,
  };
}

function skirtPanels(size: BodySize, layer: LayerDepth): GarmentPanels {
  const stations = bodyStations(size);
  const { torso, limb } = stations.segments;
  const skirt = panelRings(
    {
      heights: [
        SKIRT_HEM_Y,
        LANDMARK.midThigh,
        LANDMARK.thigh,
        LANDMARK.crotch,
        LANDMARK.hip,
        LANDMARK.highHip,
        JEANS_WAISTBAND_Y,
      ],
      stations: stations.torso,
      ease: SKIRT_EASE,
      segments: torso,
      hang: SKIRT_HANG,
    },
    layer,
  );
  return {
    trunk: skirt,
    limb: [],
    trunkSegments: torso,
    limbSegments: limb,
    trunkCapEnd: false,
  };
}

function kaftanPanels(size: BodySize, layer: LayerDepth): GarmentPanels {
  const stations = bodyStations(size);
  const { torso, limb } = stations.segments;
  const body = panelRings(
    {
      heights: [
        KAFTAN_HEM_Y,
        LANDMARK.lowerCalf,
        LANDMARK.calf,
        LANDMARK.knee,
        LANDMARK.midThigh,
        LANDMARK.crotch,
        LANDMARK.hip,
        LANDMARK.highHip,
        LANDMARK.waist,
        LANDMARK.underBust,
        LANDMARK.bust,
        LANDMARK.chest,
        LANDMARK.shoulder,
        LANDMARK.shoulderTop,
      ],
      stations: stations.torso,
      ease: KAFTAN_EASE,
      segments: torso,
      hang: KAFTAN_HANG,
    },
    layer,
  );
  const neckBody = ringAtHeight(stations.torso, TEE_NECK_Y);
  const neck = clothOver(neckBody, neckBody.girthCm * 1.25, torso, 'base');
  const sleeve = panelRings(
    {
      heights: [
        ARM_LANDMARK.forearm,
        ARM_LANDMARK.elbow,
        1.16,
        1.28,
        ARM_LANDMARK.armTop,
      ],
      stations: stations.arm,
      ease: KAFTAN_SLEEVE_EASE,
      segments: limb,
    },
    layer,
  );
  return {
    trunk: [...body, neck],
    limb: sleeve,
    trunkSegments: torso,
    limbSegments: limb,
    trunkCapEnd: false,
  };
}

function panelsFor(id: GarmentBlockId, size: BodySize, layer: LayerDepth): GarmentPanels {
  switch (id) {
    case 'tee-crew-relaxed':
      return teePanels(size, layer);
    case 'tee-long-relaxed':
      return teePanels(size, layer, true);
    case 'jeans-straight':
      return bottomPanels(size, layer, 'straight');
    case 'pants-wide-leg':
      return bottomPanels(size, layer, 'wide');
    case 'shorts-relaxed':
      return bottomPanels(size, layer, 'shorts');
    case 'dress-midi':
      return dressPanels(size, layer);
    case 'abaya-open':
      return abayaPanels(size, layer);
    case 'skirt-a-line':
      return skirtPanels(size, layer);
    case 'kaftan-relaxed':
      return kaftanPanels(size, layer);
  }
}

/**
 * A garment block at one size and one layer depth.
 *
 * Same segment counts at every size, so two sizes of the same block share a topology and
 * the size control in the viewer is a vertex blend rather than a fetch (ADR-0003).
 */
export function garmentMesh(
  id: GarmentBlockId,
  size: BodySize,
  layer: LayerDepth = 'base',
): MeshData {
  const panels = panelsFor(id, size, layer);
  const parts: MeshData[] = [
    loft(panels.trunk, {
      segments: panels.trunkSegments,
      capEnd: panels.trunkCapEnd,
    }),
  ];
  if (panels.limb.length >= 2) {
    parts.push(
      loft(panels.limb, { segments: panels.limbSegments }),
      loft(mirrored(panels.limb), { segments: panels.limbSegments }),
    );
  }
  return mergeMeshes(parts);
}

/**
 * Finished garment girth at a height, centimetres.
 *
 * Read from the same rings the mesh is lofted from, including the clearance widening, so
 * the fit reading cannot drift from the garment on screen.
 */
export function garmentGirthAt(
  id: GarmentBlockId,
  size: BodySize,
  y: number,
  layer: LayerDepth = 'base',
): number {
  const panels = panelsFor(id, size, layer);
  const trunkBottom = panels.trunk[0];
  const definition = block(id);
  const onLimb =
    definition?.slot === 'bottom' &&
    panels.limb.length >= 2 &&
    trunkBottom !== undefined &&
    y < trunkBottom.y;
  return ringAtHeight(onLimb ? panels.limb : panels.trunk, y).girthCm;
}

/** The body girth a garment's fit point is measured against, centimetres. */
export function bodyGirthAtFitPoint(size: BodySize, point: FitPoint): number {
  const stations = bodyStations(size);
  const source = point.key === 'thigh' ? stations.leg : stations.torso;
  return ringAtHeight(source, point.y).girthCm;
}
