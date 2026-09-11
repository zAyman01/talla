/**
 * Fit: what the ease at a size actually is, in centimetres.
 *
 * This exists because a picture of a garment on a form answers "what does it look like"
 * and leaves "will it fit me" untouched, and the second question is the one that decides
 * whether a cash-on-delivery parcel is accepted at the door.
 *
 * The reading is the garment's finished girth minus the body's, at the points a tailor
 * would measure. Both numbers come from the same rings the mesh is built from, so the
 * figure on screen and the number beside it cannot drift apart.
 *
 * It is not a recommendation. Buyer measurements are out of scope for v1 (spec 4), so
 * this describes how a size sits on the mannequin and stops there.
 */

import type { BodySize } from '@talla/shared';
import type { FitPoint, GarmentBlockId, LayerDepth } from './garment.ts';
import { block, bodyGirthAtFitPoint, garmentGirthAt } from './garment.ts';

/**
 * How a size sits. Thresholds are girth ease in centimetres at the primary fit point,
 * which is the grading a pattern room works in.
 */
export type FitVerdict = 'tight' | 'fitted' | 'relaxed' | 'loose';

export interface FitReading {
  readonly key: FitPoint['key'];
  readonly bodyCm: number;
  readonly garmentCm: number;
  readonly easeCm: number;
}

export interface GarmentFit {
  readonly size: BodySize;
  readonly verdict: FitVerdict;
  /** The primary point the verdict came from. Tops read at the chest, bottoms the waist. */
  readonly primary: FitPoint['key'];
  readonly readings: readonly FitReading[];
}

const TIGHT_BELOW_CM = 2;
const FITTED_BELOW_CM = 6;
const RELAXED_BELOW_CM = 12;

export function verdictFor(easeCm: number): FitVerdict {
  if (easeCm < TIGHT_BELOW_CM) return 'tight';
  if (easeCm < FITTED_BELOW_CM) return 'fitted';
  if (easeCm < RELAXED_BELOW_CM) return 'relaxed';
  return 'loose';
}

const round = (value: number): number => Math.round(value * 10) / 10;

export function garmentFit(
  id: GarmentBlockId,
  size: BodySize,
  layer: LayerDepth = 'base',
): GarmentFit {
  const definition = block(id);
  if (!definition) throw new Error(`unknown block: ${id}`);
  const readings = definition.fitPoints.map((point) => {
    // Ease is the difference of the rounded girths, not the rounded difference. A buyer
    // reading all three numbers has to be able to subtract them and get the same answer.
    const bodyCm = round(bodyGirthAtFitPoint(size, point));
    const garmentCm = round(garmentGirthAt(id, size, point.y, layer));
    return { key: point.key, bodyCm, garmentCm, easeCm: round(garmentCm - bodyCm) };
  });
  const first = readings[0];
  if (!first) throw new Error(`block ${id} declares no fit points`);
  return {
    size,
    verdict: verdictFor(first.easeCm),
    primary: first.key,
    readings,
  };
}
