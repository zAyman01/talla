/**
 * The mannequin: a parametric standing form, one topology, six sizes.
 *
 * The figure is a faceless, full-height female retail mannequin. Its silhouette carries
 * real measurements because the fit reading beside the viewer is computed from these
 * same numbers (see `fit.ts`). The head, hands and feet are deliberately featureless:
 * they make every angle read as a complete physical form without pretending to be a
 * scanned person.
 *
 * Height is the same at every size. Sizes differ in shape, not in stature, so the camera
 * framing does not jump when a buyer changes size, and the morph target stays a pure
 * shape blend (ADR-0003).
 */

import type { BodySize } from '@talla/shared';
import type { MeshData, Ring } from './geometry.ts';
import { loft, mergeMeshes, ringAtHeight, ringPoints } from './geometry.ts';

export const BODY_SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL'] as const;

/** The size the base mesh is built at. Every other size ships as a delta against it. */
export const BASE_BODY_SIZE: BodySize = 'M';

/** The stature the size chart is graded for and the visible crown reaches. */
export const FIGURE_HEIGHT_M = 1.68;

const TORSO_SEGMENTS = 48;
const LIMB_SEGMENTS = 24;

/** Three measured girths per size, centimetres. Everything else is derived from them. */
const CHART: Record<BodySize, { bust: number; waist: number; hip: number }> = {
  XS: { bust: 80, waist: 62, hip: 88 },
  S: { bust: 86, waist: 68, hip: 94 },
  M: { bust: 92, waist: 74, hip: 100 },
  L: { bust: 98, waist: 80, hip: 106 },
  XL: { bust: 106, waist: 88, hip: 114 },
  XXL: { bust: 114, waist: 96, hip: 122 },
};

/**
 * Full girths for one size, centimetres.
 *
 * The derived ratios are a standard block grading, not a measurement of any person. They
 * exist so that a size change moves the whole figure coherently instead of inflating the
 * bust while the knees stay put.
 */
export interface BodyMeasurements {
  readonly bust: number;
  readonly waist: number;
  readonly hip: number;
  readonly neck: number;
  readonly chest: number;
  readonly underBust: number;
  readonly highHip: number;
  readonly thigh: number;
  readonly knee: number;
  readonly calf: number;
  readonly ankle: number;
  readonly upperArm: number;
  readonly wrist: number;
  readonly shoulderWidth: number;
}

export function measurements(size: BodySize): BodyMeasurements {
  const { bust, waist, hip } = CHART[size];
  return {
    bust,
    waist,
    hip,
    neck: 30 + (bust - 80) * 0.13,
    chest: bust - 7,
    underBust: bust - 14,
    highHip: waist + (hip - waist) * 0.45,
    thigh: hip * 0.57,
    knee: hip * 0.37,
    calf: hip * 0.345,
    ankle: hip * 0.225,
    upperArm: bust * 0.3,
    wrist: bust * 0.17,
    shoulderWidth: 36 + (bust - 80) * 0.14,
  };
}

/** Heights of the landmarks a garment block hangs from, metres above the floor. */
export const LANDMARK = {
  legEnd: 0.03,
  ankle: 0.085,
  lowerCalf: 0.24,
  calf: 0.375,
  knee: 0.47,
  aboveKnee: 0.53,
  midThigh: 0.65,
  thigh: 0.76,
  crotch: 0.805,
  hip: 0.905,
  highHip: 0.995,
  waist: 1.065,
  underBust: 1.165,
  bust: 1.235,
  chest: 1.29,
  shoulder: 1.37,
  shoulderTop: 1.395,
  neckBase: 1.415,
  neckTop: 1.462,
} as const;

/** Where the arm loft sits, metres. Separate from LANDMARK because sleeves use it. */
export const ARM_LANDMARK = {
  handEnd: 0.665,
  wrist: 0.8,
  forearm: 0.95,
  elbow: 1.06,
  upperArm: 1.27,
  armTop: 1.36,
} as const;

/**
 * The figure's vertical extent, metres. The viewer frames the whole mannequin, including
 * its feet and crown, against these stable bounds.
 */
export const FIGURE_BOUNDS = { bottom: 0.012, top: FIGURE_HEIGHT_M } as const;

export interface BodyStations {
  /** Bottom to top, crotch through the cut neck. */
  readonly torso: readonly Ring[];
  /** One leg, bottom to top. Mirror by negating `centerX`. */
  readonly leg: readonly Ring[];
  /** One arm, bottom to top. */
  readonly arm: readonly Ring[];
  /** A featureless head, neck overlap to crown. */
  readonly head: readonly Ring[];
  /** One foot, sole to ankle. Mirror by negating `centerX`. */
  readonly foot: readonly Ring[];
  readonly segments: { readonly torso: number; readonly limb: number };
}

/** Half the hip width, metres. The legs are placed against it. */
function hipHalfWidth(body: BodyMeasurements): number {
  return (body.hip / 100) * 0.185;
}

/** Widest half-extent of a ring across the figure, metres. */
function halfWidth(ring: Ring, segments: number): number {
  const points = ringPoints({ ...ring, centerX: 0, centerZ: 0 }, segments);
  let widest = 0;
  for (let i = 0; i < segments; i += 1) {
    widest = Math.max(widest, Math.abs(points[i * 2] ?? 0));
  }
  return widest;
}

/**
 * Least amount the shoulder stands proud of the bust below it, metres.
 *
 * Without a floor the grading inverts: the bust outgrows the shoulder by XXL, the
 * shoulder line ends up narrower than the ribs, and the arms disappear inside the chest
 * at exactly the sizes that most need to see a sleeve.
 */
const DELTOID_M = 0.022;

/** Daylight between a hanging wrist and the hip it passes, metres. */
const WRIST_CLEARANCE_M = 0.015;

/** Rescale a ring so its widest half-extent is `targetHalf`. Girth scales linearly. */
function widenTo(ring: Ring, targetHalf: number, segments: number): Ring {
  const current = halfWidth(ring, segments);
  if (current <= 0) return ring;
  return { ...ring, girthCm: (ring.girthCm * targetHalf) / current };
}

export function bodyStations(size: BodySize): BodyStations {
  const body = measurements(size);
  const hipHalf = hipHalfWidth(body);

  const bust = ring(LANDMARK.bust, body.bust, 0.7, 0, 0.005, 2.3);
  const bustHalf = halfWidth(bust, TORSO_SEGMENTS);
  // The shoulder is the measured shoulder, or wide enough to clear the bust, whichever
  // is larger. The shoulder line has to stay the widest thing on the upper body at every
  // size, because it is what a sleeve hangs off.
  const shoulderTargetHalf = Math.max(body.shoulderWidth / 200, bustHalf + DELTOID_M);

  const torso: readonly Ring[] = [
    ring(LANDMARK.crotch, body.hip * 0.96, 0.78, 0, -0.01, 2.4),
    ring(0.84, body.hip * 0.985, 0.75, 0, -0.014, 2.45),
    ring(LANDMARK.hip, body.hip, 0.72, 0, -0.018, 2.55),
    ring(0.955, body.hip * 0.965, 0.74, 0, -0.012, 2.55),
    ring(LANDMARK.highHip, body.highHip, 0.76, 0, -0.006, 2.5),
    ring(1.03, body.waist * 1.08, 0.76, 0, -0.002, 2.45),
    ring(LANDMARK.waist, body.waist, 0.73, 0, 0, 2.4),
    ring(1.115, body.waist * 1.08, 0.72, 0, 0.002, 2.4),
    ring(LANDMARK.underBust, body.underBust, 0.7, 0, 0.004, 2.4),
    ring(1.205, body.bust * 0.96, 0.69, 0, 0.009, 2.35),
    bust,
    ring(1.265, body.bust * 0.965, 0.66, 0, 0.008, 2.4),
    ring(LANDMARK.chest, body.chest, 0.6, 0, 0.005, 2.5),
    ring(1.335, body.chest * 0.97, 0.55, 0, 0.003, 2.65),
    widenTo(
      ring(LANDMARK.shoulder, body.shoulderWidth * 2.42, 0.44, 0, 0.002, 2.8),
      shoulderTargetHalf,
      TORSO_SEGMENTS,
    ),
    widenTo(
      ring(LANDMARK.shoulderTop, body.shoulderWidth * 1.74, 0.55, 0, 0.002, 2.6),
      shoulderTargetHalf * 0.8,
      TORSO_SEGMENTS,
    ),
    ring(LANDMARK.neckBase, body.neck * 1.35, 0.8, 0, 0.002, 2.2),
    ring(LANDMARK.neckTop, body.neck, 0.86, 0, 0.004, 2.1),
  ];

  // A narrow parallel stance. Bringing the feet together reads as a fashion pose and
  // merges both trouser legs into one column, which makes a straight jean look like a
  // skirt exactly where a buyer is trying to judge the leg.
  const legTopOffset = hipHalf * 0.46;
  const legFootOffset = hipHalf * 0.42;
  const legX = (t: number): number => legFootOffset + (legTopOffset - legFootOffset) * t;
  const leg: readonly Ring[] = [
    ring(LANDMARK.legEnd, body.ankle * 0.95, 0.92, legX(0), 0, 2.1),
    ring(LANDMARK.ankle, body.ankle, 0.92, legX(0.05), 0, 2.1),
    ring(0.155, body.ankle * 1.12, 0.92, legX(0.13), -0.001, 2.1),
    ring(LANDMARK.lowerCalf, body.calf * 0.78, 0.93, legX(0.24), 0, 2.1),
    ring(LANDMARK.calf, body.calf, 0.93, legX(0.39), -0.004, 2.1),
    ring(0.425, body.calf * 0.91, 0.94, legX(0.45), -0.002, 2.15),
    ring(LANDMARK.knee, body.knee, 0.95, legX(0.5), 0, 2.2),
    ring(LANDMARK.aboveKnee, body.knee * 1.12, 0.94, legX(0.57), 0, 2.2),
    ring(LANDMARK.midThigh, body.thigh * 0.88, 0.92, legX(0.71), 0, 2.2),
    ring(LANDMARK.thigh, body.thigh, 0.92, legX(0.84), 0, 2.2),
    ring(0.79, body.thigh * 1.055, 0.88, legX(0.94), -0.004, 2.25),
    ring(LANDMARK.hip, body.thigh * 1.08, 0.92, legX(1), 0, 2.2),
  ];

  // Arms hang from under the shoulder and swing slightly out, the way a display form
  // holds them: the upper arm tucks to the shoulder point, and by the wrist there is
  // daylight past the hip. A fraction of the shoulder span will not do it, because at
  // this grading the hips are as wide as the shoulders.
  const armHalf = halfWidth(
    ring(ARM_LANDMARK.upperArm, body.upperArm, 0.95, 0, 0, 2.1),
    LIMB_SEGMENTS,
  );
  const wristHalf = halfWidth(
    ring(ARM_LANDMARK.wrist, body.wrist, 0.88, 0, 0, 2.1),
    LIMB_SEGMENTS,
  );
  const armTopX = shoulderTargetHalf - armHalf;
  const armHandX = hipHalf + wristHalf + WRIST_CLEARANCE_M;
  const armX = (t: number): number => armHandX + (armTopX - armHandX) * t;
  const arm: readonly Ring[] = [
    ring(ARM_LANDMARK.handEnd, body.wrist * 0.68, 0.54, armX(0), 0.002, 2.2),
    ring(0.682, body.wrist * 0.9, 0.58, armX(0.025), 0.002, 2.25),
    ring(0.71, body.wrist * 1.28, 0.56, armX(0.06), 0.001, 2.35),
    ring(0.75, body.wrist * 1.18, 0.6, armX(0.1), 0, 2.3),
    ring(ARM_LANDMARK.wrist, body.wrist, 0.88, armX(0.15), 0, 2.1),
    ring(0.87, body.upperArm * 0.62, 0.9, armX(0.25), 0, 2.1),
    ring(ARM_LANDMARK.forearm, body.upperArm * 0.72, 0.92, armX(0.38), 0, 2.1),
    ring(ARM_LANDMARK.elbow, body.upperArm * 0.78, 0.94, armX(0.55), 0, 2.1),
    ring(1.16, body.upperArm * 0.9, 0.95, armX(0.69), 0, 2.1),
    ring(ARM_LANDMARK.upperArm, body.upperArm, 0.95, armX(0.86), 0, 2.1),
    ring(ARM_LANDMARK.armTop, body.upperArm * 1.15, 0.95, armX(1), 0, 2.1),
  ];

  const headScale = 1 + (body.bust - CHART.M.bust) * 0.001;
  const head: readonly Ring[] = [
    ring(1.445, body.neck * 1.01, 0.9, 0, 0.003, 2.05),
    ring(1.475, body.neck * 1.04, 0.88, 0, 0.004, 2.05),
    ring(1.495, 35.5 * headScale, 0.82, 0, 0.007, 2.02),
    ring(1.52, 41 * headScale, 0.76, 0, 0.011, 2.02),
    ring(1.555, 48.5 * headScale, 0.78, 0, 0.009, 2.01),
    ring(1.6, 54.5 * headScale, 0.82, 0, 0.004, 2),
    ring(1.635, 53 * headScale, 0.84, 0, 0, 2),
    ring(1.662, 43 * headScale, 0.86, 0, -0.002, 2),
    ring(1.677, 24 * headScale, 0.88, 0, -0.003, 2),
    ring(FIGURE_HEIGHT_M, 3.5 * headScale, 0.9, 0, -0.003, 2),
  ];

  const footX = legX(0.03);
  const foot: readonly Ring[] = [
    ring(FIGURE_BOUNDS.bottom, body.ankle * 0.78, 2.2, footX, 0.092, 2.4),
    ring(0.018, body.ankle * 1.22, 2.55, footX, 0.077, 2.45),
    ring(0.028, body.ankle * 1.38, 2.45, footX, 0.059, 2.45),
    ring(0.042, body.ankle * 1.32, 2.15, footX, 0.043, 2.4),
    ring(0.058, body.ankle * 1.2, 1.65, footX, 0.026, 2.3),
    ring(0.074, body.ankle * 1.08, 1.18, footX, 0.01, 2.2),
    ring(LANDMARK.ankle, body.ankle, 0.92, footX, 0, 2.1),
  ];

  return {
    torso,
    leg,
    arm,
    head,
    foot,
    segments: { torso: TORSO_SEGMENTS, limb: LIMB_SEGMENTS },
  };
}

function ring(
  y: number,
  girthCm: number,
  depthRatio: number,
  centerX: number,
  centerZ: number,
  exponent: number,
): Ring {
  return { y, girthCm, depthRatio, centerX, centerZ, exponent };
}

/** Mirror a limb loft to the other side of the figure. */
export function mirrored(rings: readonly Ring[]): readonly Ring[] {
  return rings.map((r) => ({ ...r, centerX: -r.centerX }));
}

/**
 * The mannequin at one size.
 *
 * Parts overlap rather than stitching into one manifold. The opaque joins stay closed
 * from every buyer-facing angle while keeping a stable, inexpensive morph topology.
 */
export function bodyMesh(size: BodySize): MeshData {
  const stations = bodyStations(size);
  const torso = { segments: stations.segments.torso, capStart: true, capEnd: true };
  const limb = { segments: stations.segments.limb, capStart: true, capEnd: false };
  return mergeMeshes([
    loft(stations.torso, torso),
    loft(stations.leg, limb),
    loft(mirrored(stations.leg), limb),
    loft(stations.arm, { ...limb, capStart: true }),
    loft(mirrored(stations.arm), { ...limb, capStart: true }),
    loft(stations.head, {
      segments: stations.segments.torso,
      capStart: true,
      capEnd: true,
    }),
    loft(stations.foot, { segments: stations.segments.limb, capStart: true }),
    loft(mirrored(stations.foot), { segments: stations.segments.limb, capStart: true }),
  ]);
}

/**
 * Body girth at a height, centimetres, interpolated between torso stations.
 *
 * Used by the fit reading and by the garment blocks, so a garment's ease is measured
 * against the same curve the mesh is built from.
 */
export function torsoGirthAt(size: BodySize, y: number): number {
  return ringAtHeight(bodyStations(size).torso, y).girthCm;
}
