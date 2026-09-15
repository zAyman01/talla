import type { CatalogProduct } from './product.ts';

/** Start with one complete outfit while never stacking color variants in one slot. */
export function initialOutfit(products: readonly CatalogProduct[]): ReadonlySet<string> {
  const chosen = new Set<string>();
  for (const slot of ['top', 'bottom'] as const) {
    const inSlot = products.filter((candidate) => candidate.slot === slot);
    const product =
      inSlot.find((candidate) => candidate.colorHex.toLowerCase() !== '#17181a') ??
      inSlot[0];
    if (product) chosen.add(product.id);
  }
  return chosen;
}

/** Select a variant as a replacement for the piece already occupying the same slot. */
export function toggleOutfit(
  products: readonly CatalogProduct[],
  current: ReadonlySet<string>,
  id: string,
): ReadonlySet<string> {
  const next = new Set(current);
  if (next.delete(id)) return next;
  const selected = products.find((product) => product.id === id);
  if (!selected) return next;
  for (const product of products) {
    if (product.slot === selected.slot) next.delete(product.id);
  }
  next.add(id);
  return next;
}
