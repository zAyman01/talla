import type { GarmentSpec } from '@talla/garment-spec';
import type { RankInput, Suggestion } from '../contract.ts';

const MARGIN_TIE_BAND = 0.02;
const reasons = {
  pin: { ar: 'اختيار المتجر لهذه الطلة', en: 'Paired by the store' },
  neutral: { ar: 'لون محايد يكمل الطلة', en: 'A neutral base for your outfit' },
  volume: { ar: 'قصة توازن القطع الواسعة', en: 'A balanced silhouette' },
  color: { ar: 'ألوان متناسقة مع اختيارك', en: 'Colors that work with your selection' },
} as const;

function harmony(a: GarmentSpec, b: GarmentSpec): number {
  let score = 0;
  let weights = 0;
  for (const x of a.style.dominant_colors) {
    for (const y of b.style.dominant_colors) {
      const weight = x.weight * y.weight;
      const neutral = Math.min(Math.hypot(x.a, x.b), Math.hypot(y.a, y.b)) < 12;
      const angle = Math.abs(Math.atan2(x.b, x.a) - Math.atan2(y.b, y.a));
      const distance = Math.min(angle, 2 * Math.PI - angle);
      score +=
        weight * (neutral ? 1 : Math.max(1 - distance / Math.PI, distance / Math.PI));
      weights += weight;
    }
  }
  return weights > 0 ? score / weights : 0;
}

/** Input specs are validated at the producer boundary. No I/O or mutation here. */
export function rankSuggestions(input: RankInput): readonly Suggestion[] {
  const outfit = [input.anchor, ...(input.outfit ?? [])];
  const occupied = new Set(outfit.map((s) => s.style.slot));
  const seen = new Set<string>();
  const ranked: Suggestion[] = [];
  for (const spec of input.candidates) {
    if (seen.has(spec.id)) continue;
    seen.add(spec.id);
    if (spec.tenant_id !== input.anchor.tenant_id || !input.inStock.has(spec.id))
      continue;
    if (!input.fillSlots.includes(spec.style.slot) || occupied.has(spec.style.slot))
      continue;
    if (
      input.selectedSize &&
      (!spec.sizes_available.some((s) => s.size === input.selectedSize) ||
        (input.stockBySize?.get(spec.id)?.get(input.selectedSize) ?? 0) < 1)
    )
      continue;
    if (
      outfit.some(
        (s) =>
          s.id === spec.id ||
          Math.abs(s.style.formality - spec.style.formality) > 1 ||
          (s.style.season !== 'all' &&
            spec.style.season !== 'all' &&
            s.style.season !== spec.style.season),
      )
    )
      continue;
    const neutral = spec.style.dominant_colors.every((c) => Math.hypot(c.a, c.b) < 12);
    const balance =
      spec.style.volume === 'slim' && outfit.some((s) => s.style.volume === 'oversized');
    const busy =
      spec.style.pattern_busy > 0.5 && outfit.some((s) => s.style.pattern_busy > 0.5);
    const pinned = input.pins.some(
      (p) => p.suggestedId === spec.id && outfit.some((s) => s.id === p.anchorId),
    );
    const score =
      0.7 * Math.min(...outfit.map((s) => harmony(s, spec))) +
      (busy ? 0 : 0.2) +
      (balance ? 0.1 : 0.05);
    ranked.push({
      garmentId: spec.id,
      slot: spec.style.slot,
      score,
      pinned,
      reason: pinned
        ? reasons.pin
        : neutral
          ? reasons.neutral
          : balance
            ? reasons.volume
            : reasons.color,
    });
  }
  ranked.sort(
    (a, b) =>
      Number(b.pinned) - Number(a.pinned) ||
      b.score - a.score ||
      a.garmentId.localeCompare(b.garmentId),
  );
  // Disjoint adjacent swaps. Advancing by two prevents either item moving twice.
  for (let i = 0; i + 1 < ranked.length; i++) {
    const a = ranked[i];
    const b = ranked[i + 1];
    if (!a || !b || a.pinned || b.pinned) continue;
    const aPriority = input.merchandisingPriority?.get(a.garmentId) ?? 0;
    const bPriority = input.merchandisingPriority?.get(b.garmentId) ?? 0;
    if (
      a.score - b.score <= Math.abs(a.score) * MARGIN_TIE_BAND &&
      bPriority > aPriority
    ) {
      ranked[i] = b;
      ranked[i + 1] = a;
      i++;
    }
  }
  return ranked.slice(0, 6);
}
