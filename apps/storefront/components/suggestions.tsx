'use client';

import Image from 'next/image';
import type { ReactNode } from 'react';
import type { CatalogProduct } from '../product.ts';

interface SuggestionsProps {
  readonly currentOutfit: readonly CatalogProduct[];
  readonly allProducts: readonly CatalogProduct[];
  readonly onTryOn: (productId: string) => void;
}

interface StylistSuggestion {
  readonly product: CatalogProduct;
  readonly reason: string;
}

/**
 * Derives complementary items for the active outfit based on slot and color harmony.
 * Follows spec section 10: top wants a bottom, neutral colors pair with anything,
 * and outfit combinations stay additive.
 */
function deriveSuggestions(
  currentOutfit: readonly CatalogProduct[],
  allProducts: readonly CatalogProduct[],
): readonly StylistSuggestion[] {
  if (allProducts.length === 0) return [];
  const activeIds = new Set(currentOutfit.map((p) => p.id));
  const activeSlots = new Set(currentOutfit.map((p) => p.slot));

  // If top is selected, prioritize bottoms; if bottom is selected, prioritize tops.
  const preferredSlot = activeSlots.has('top') && !activeSlots.has('bottom')
    ? 'bottom'
    : activeSlots.has('bottom') && !activeSlots.has('top')
      ? 'top'
      : undefined;

  const candidates = allProducts.filter((p) => !activeIds.has(p.id));
  const scored: StylistSuggestion[] = candidates.map((product) => {
    let reason = 'قطعة تكمل الطلة وتتناسق معها';
    if (preferredSlot && product.slot === preferredSlot) {
      reason = product.slot === 'bottom' ? 'بنطال يكمل إطلالة القطعة العلوية' : 'قطعة علوية تناسب هذا البنطال';
    } else if (product.colorHex.toLowerCase() === '#ffffff' || product.colorHex.toLowerCase() === '#fafaf9' || product.colorHex.toLowerCase() === '#17181a') {
      reason = 'لون محايد أساسي يتناسق مع كل الألوان';
    } else {
      reason = 'تنسيق متوازن وأنيق مع اختيارك';
    }
    return { product, reason };
  });

  // Sort preferred slots first
  return scored
    .sort((a, b) => {
      const aPref = preferredSlot && a.product.slot === preferredSlot ? 1 : 0;
      const bPref = preferredSlot && b.product.slot === preferredSlot ? 1 : 0;
      return bPref - aPref;
    })
    .slice(0, 6);
}

function money(value: number): string {
  return `${new Intl.NumberFormat('en-US').format(value / 100)} ج.م`;
}

export function Suggestions({
  currentOutfit,
  allProducts,
  onTryOn,
}: SuggestionsProps): ReactNode {
  const suggestions = deriveSuggestions(currentOutfit, allProducts);
  if (suggestions.length === 0) return null;

  return (
    <section className="suggestions-panel" aria-labelledby="suggestions-title">
      <div className="suggestions-heading">
        <h3 id="suggestions-title">اقتراحات تكمل طلتك</h3>
        <span className="muted font-xs">نسقي القطع معاً على المانيكان</span>
      </div>
      <div className="suggestions-strip" role="region" aria-label="شريط القطع المقترحة">
        {suggestions.map(({ product, reason }) => (
          <article className="suggestion-card" key={product.id}>
            <div className="suggestion-card-image">
              <Image
                src={product.image}
                width={product.imageWidth}
                height={product.imageHeight}
                sizes="120px"
                alt=""
                loading="lazy"
              />
            </div>
            <div className="suggestion-card-body">
              <strong className="suggestion-title">{product.name}</strong>
              <span className="suggestion-reason">{reason}</span>
              <span className="price numeric">{money(product.price)}</span>
              <button
                type="button"
                className="suggestion-try-btn"
                onClick={() => {
                  onTryOn(product.id);
                }}
                aria-label={`جرّبي ${product.name} على المانيكان`}
              >
                جرّبي القطعة
              </button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
