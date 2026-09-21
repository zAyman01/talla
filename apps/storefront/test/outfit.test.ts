import { describe, expect, it } from 'vitest';
import type { CatalogProduct } from '../product.ts';
import { initialOutfit, toggleOutfit } from '../outfit.ts';

function product(id: string, slot: 'top' | 'bottom'): CatalogProduct {
  return {
    id,
    blockId: slot === 'top' ? 'tee-crew-relaxed' : 'pants-wide-leg',
    name: id,
    slot,
    categoryLabel: slot,
    image: '/catalog/item.webp',
    imageWidth: 10,
    imageHeight: 20,
    price: 100,
    colorHex: '#111111',
    colors: ['Black'],
    sourceSizes: ['M'],
    allSourceSizes: ['M'],
    imageCount: 1,
    images: [],
    sizes: ['M'],
  };
}

const products = [
  product('top-a', 'top'),
  product('top-b', 'top'),
  product('bottom', 'bottom'),
];

describe('outfit selection', () => {
  it('starts with at most one item in each slot', () => {
    expect([...initialOutfit(products)]).toEqual(['top-a', 'bottom']);
  });

  it('replaces a selected color or style in the same slot', () => {
    const next = toggleOutfit(products, initialOutfit(products), 'top-b');
    expect([...next]).toEqual(['bottom', 'top-b']);
  });

  it('allows a selected item to be removed', () => {
    const next = toggleOutfit(products, initialOutfit(products), 'bottom');
    expect([...next]).toEqual(['top-a']);
  });
});
