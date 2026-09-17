'use client';

import {
  BagIcon,
  CheckCircleIcon,
  CoatHangerIcon,
} from '@phosphor-icons/react';
import dynamic from 'next/dynamic';
import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { BodySize } from '@talla/shared';
import type { FitVerdict } from '@talla/blocks';
import { garmentFit } from '@talla/blocks';
import { TIER_BUDGET, probeTier } from '@talla/viewer';
import type { DeviceTier } from '@talla/shared';
import type { DressedGarment } from '@talla/viewer';
import type { CatalogProduct } from '../product.ts';
import { initialOutfit, toggleOutfit } from '../outfit.ts';
import { CheckoutModal, type CheckoutLineItem } from './checkout-modal.tsx';
import { Suggestions } from './suggestions.tsx';

const Mannequin = dynamic(() => import('./mannequin.tsx').then((m) => m.Mannequin), {
  ssr: false,
  loading: () => <div className="viewer-stage stage-skeleton" aria-hidden="true" />,
});

type Product = CatalogProduct;
type ProductId = string;
type CatalogSourceFilter = 'all' | 'Farid Store' | 'Clother Wear';
type CatalogSlotFilter = 'all' | Product['slot'];

interface CartItem {
  readonly id: ProductId;
  readonly size: BodySize;
  readonly quantity: number;
}

const SIZES: readonly BodySize[] = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];

const VERDICT_LABEL: Record<FitVerdict, string> = {
  tight: 'ضيق',
  fitted: 'مضبوط',
  relaxed: 'مريح',
  loose: 'واسع',
};

/** Where a reading was taken. A top's hem reading is a width, not a body point. */
function pointLabel(slot: Product['slot'], key: string): string {
  if (slot === 'top' && key === 'hip') return 'عرض الطرف';
  if (key === 'chest') return 'الصدر';
  if (key === 'waist') return 'الخصر';
  if (key === 'hip') return 'الورك';
  return 'الفخذ';
}

/**
 * Whether to quote the ease beside a reading.
 *
 * A top hangs from the chest, so the gap between its hem and the hip underneath is tens
 * of centimetres by design. Printing that as ease reads as a fault rather than as a
 * garment that does not cling, so the hem is quoted as a width and nothing else.
 */
function showsEase(slot: Product['slot'], key: string): boolean {
  return !(slot === 'top' && key === 'hip');
}

function money(value: number): string {
  return `${new Intl.NumberFormat('en-US').format(value / 100)} ج.م`;
}

function centimetres(value: number): string {
  return `${new Intl.NumberFormat('en-US').format(value)} سم`;
}

function sourceMeasurement(value: string, unit: string | undefined): string {
  return unit ? `${value} ${unit}` : value;
}

export function Storefront({
  products,
}: {
  readonly products: readonly Product[];
}): ReactNode {
  // One item per slot: color variants replace each other instead of occupying the same
  // 3D surface and flickering through one another.
  const [chosen, setChosen] = useState<ReadonlySet<ProductId>>(() =>
    initialOutfit(products),
  );
  const [size, setSize] = useState<BodySize>('L');
  const [cart, setCart] = useState<readonly CartItem[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [viewerAvailable, setViewerAvailable] = useState(true);
  const [sourceFilter, setSourceFilter] = useState<CatalogSourceFilter>('all');
  const [slotFilter, setSlotFilter] = useState<CatalogSlotFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');

  /**
   * The device tier, decided before the renderer is fetched (spec 11.2).
   */
  const [tier, setTier] = useState<DeviceTier | undefined>(undefined);

  const outfit = useMemo(
    () => products.filter((product) => chosen.has(product.id)),
    [chosen, products],
  );

  const visibleProducts = useMemo(
    () =>
      products.filter((product) => {
        const matchesSource =
          sourceFilter === 'all' || product.source?.merchant === sourceFilter;
        const matchesSlot = slotFilter === 'all' || product.slot === slotFilter;
        const matchesSearch =
          searchQuery.trim() === '' ||
          product.name.toLowerCase().includes(searchQuery.trim().toLowerCase()) ||
          product.categoryLabel.toLowerCase().includes(searchQuery.trim().toLowerCase());
        return matchesSource && matchesSlot && matchesSearch;
      }),
    [products, slotFilter, sourceFilter, searchQuery],
  );

  /**
   * Layering resolves by slot, outermost last. A top worn with a bottom is the `over`
   * variant, solved against a body already carrying the bottom's thickness, so the hem
   * falls past the waistband instead of through it (spec 8).
   */
  const dressed = useMemo<readonly DressedGarment[]>(() => {
    const hasBottom = outfit.some((product) => product.slot === 'bottom');
    return outfit.map((product) => ({
      blockId: product.blockId,
      colorHex: product.colorHex,
      layer: product.slot === 'top' && hasBottom ? ('over' as const) : ('base' as const),
      label: product.name,
    }));
  }, [outfit]);

  /**
   * Fit is always read at the base layer.
   */
  const fits = useMemo(
    () =>
      outfit.map((product) => {
        const chart = product.sizeChart?.rows[size];
        return {
          product,
          chart,
          fit: chart === undefined ? garmentFit(product.blockId, size) : undefined,
        };
      }),
    [outfit, size],
  );

  const photographic =
    tier !== undefined && (!viewerAvailable || TIER_BUDGET[tier].usesTurntable);

  const unavailable = outfit.filter((product) => !product.sizes.includes(size));
  const orderable = outfit.filter((product) => product.sizes.includes(size));
  const outfitTotal = orderable.reduce((sum, product) => sum + product.price, 0);

  const totalCartCount = cart.reduce((sum, item) => sum + item.quantity, 0);

  const cartLines: readonly CheckoutLineItem[] = useMemo(
    () =>
      cart.flatMap((item) => {
        const prod = products.find((p) => p.id === item.id);
        if (!prod) return [];
        return [
          {
            id: prod.id,
            name: prod.name,
            size: item.size,
            quantity: item.quantity,
            price: prod.price,
            image: prod.image,
            imageWidth: prod.imageWidth,
            imageHeight: prod.imageHeight,
          },
        ];
      }),
    [cart, products],
  );

  useEffect(() => {
    setTier(probeTier());
  }, []);

  function toggle(id: ProductId): void {
    setChosen((current) => toggleOutfit(products, current, id));
  }

  function addOutfit(): void {
    setCart((current) => {
      const next = [...current];
      for (const product of orderable) {
        const existingIndex = next.findIndex(
          (item) => item.id === product.id && item.size === size,
        );
        if (existingIndex >= 0 && next[existingIndex]) {
          const existing = next[existingIndex];
          next[existingIndex] = {
            id: existing.id,
            size: existing.size,
            quantity: existing.quantity + 1,
          };
        } else {
          next.push({ id: product.id, size, quantity: 1 });
        }
      }
      return next;
    });
    setCartOpen(true);
  }

  function updateQuantity(id: ProductId, itemSize: BodySize, delta: number): void {
    setCart((current) =>
      current
        .map((item) =>
          item.id === id && item.size === itemSize
            ? { id: item.id, size: item.size, quantity: item.quantity + delta }
            : item,
        )
        .filter((item) => item.quantity > 0),
    );
  }

  function clearCart(): void {
    setCart([]);
  }

  return (
    <div className="store-shell">
      <header className="store-header">
        <Link href="/" className="store-name" aria-label="متجر طلّة التجريبي">
          طلّة
        </Link>
        <span className="demo-badge">متجر تجريبي</span>
        <button
          className="cart-trigger"
          onClick={() => {
            setCartOpen(true);
          }}
          aria-label={`السلة، ${String(totalCartCount)} قطع`}
        >
          <BagIcon size={22} weight="regular" />
          <span>السلة</span>
          <strong>{totalCartCount}</strong>
        </button>
      </header>

      <main id="main" className="store-main">
        <section className="store-intro" aria-labelledby="catalog-title">
          <h1 id="catalog-title">شوفي القطع على المانيكان قبل الطلب</h1>
          <p>
            اختاري القطع والمقاس، وسيعرض المانيكان الطلة كاملة مع القياس النهائي لكل قطعة.
          </p>
        </section>

        <div className="buyer-layout">
          <section className="viewer-panel" aria-labelledby="viewer-title">
            <h2 id="viewer-title">طلتك على المانيكان</h2>

            {outfit.length === 0 ? (
              <div className="viewer-stage">
                <div className="outfit-empty">
                  <CoatHangerIcon size={36} weight="regular" />
                  <strong>اختاري قطعة للبدء</strong>
                  <span>اضغطي على بطاقة من الكتالوج تحت العرض.</span>
                </div>
              </div>
            ) : tier === undefined || photographic ? (
              <div className="viewer-stage">
                <div className="outfit-images">
                  {outfit.map((product) => (
                    <figure key={product.id} className={`outfit-piece ${product.slot}`}>
                      <Image
                        src={product.image}
                        width={product.imageWidth}
                        height={product.imageHeight}
                        sizes="(max-width: 767px) 46vw, 24vw"
                        alt={product.name}
                        priority
                      />
                      <figcaption>{product.name}</figcaption>
                    </figure>
                  ))}
                </div>
              </div>
            ) : (
              <Mannequin
                size={size}
                garments={dressed}
                onUnavailable={() => {
                  setViewerAvailable(false);
                }}
              />
            )}

            {photographic && outfit.length > 0 && (
              <p className="viewer-note" role="status">
                هذا الجهاز لا يشغّل العرض ثلاثي الأبعاد، لذلك تظهر صور القطع بدلاً منه.
                القياسات تحت العرض لم تتغير.
              </p>
            )}

            <div className="size-control">
              <span id="size-label">المقاس</span>
              <div role="group" aria-labelledby="size-label" className="size-segmented">
                {SIZES.map((option) => (
                  <button
                    key={option}
                    type="button"
                    aria-pressed={size === option}
                    onClick={() => {
                      setSize(option);
                    }}
                  >
                    {option}
                  </button>
                ))}
              </div>
            </div>

            {fits.length > 0 && (
              <div className="fit-readout" aria-live="polite">
                <h3>القياس على مقاس {size}</h3>
                <ul>
                  {fits.map(({ product, fit, chart }) => (
                    <li key={product.id}>
                      <p className="fit-headline">
                        <strong>{product.name}</strong>
                        {fit ? (
                          <span className={`fit-verdict ${fit.verdict}`}>
                            {VERDICT_LABEL[fit.verdict]}
                          </span>
                        ) : (
                          <span className="fit-verdict">
                            مقاس المصدر {chart?.sourceLabel}
                          </span>
                        )}
                      </p>
                      <dl>
                        {chart
                          ? chart.measurements.map((reading) => (
                              <div key={reading.key}>
                                <dt>{reading.label}</dt>
                                <dd className="numeric">
                                  {sourceMeasurement(reading.value, reading.unit)}
                                </dd>
                              </div>
                            ))
                          : fit?.readings.map((reading) => (
                              <div key={reading.key}>
                                <dt>{pointLabel(product.slot, reading.key)}</dt>
                                <dd>
                                  <span className="numeric">
                                    {centimetres(reading.garmentCm)}
                                  </span>
                                  {showsEase(product.slot, reading.key) && (
                                    <span className="muted">
                                      زيادة {centimetres(reading.easeCm)}
                                    </span>
                                  )}
                                </dd>
                              </div>
                            ))}
                      </dl>
                      {product.source && (
                        <a
                          className="measurement-source"
                          href={product.source.productUrl}
                          target="_blank"
                          rel="noreferrer"
                        >
                          بيانات المقاس: {product.source.merchant}
                        </a>
                      )}
                      {chart &&
                        product.sizeChart &&
                        product.sizeChart.notes.length > 0 && (
                          <p className="muted chart-note">
                            {product.sizeChart.notes.join(' ')}
                          </p>
                        )}
                    </li>
                  ))}
                </ul>
                <p className="muted fit-basis">
                  القياسات المنشورة تُعرض كما وردت من المتجر. القطع التي لا يتوفر لها جدول
                  تستخدم قياس نموذجها ثلاثي الأبعاد.
                </p>
              </div>
            )}

            <Suggestions
              currentOutfit={outfit}
              allProducts={products}
              onTryOn={toggle}
            />
          </section>

          <section className="catalog-panel" aria-labelledby="pieces-title">
            <div className="section-heading">
              <h2 id="pieces-title">القطع المتاحة</h2>
              <span className="muted">
                {visibleProducts.length} من {products.length} قطعة
              </span>
            </div>

            <div className="catalog-search-wrap">
              <label htmlFor="catalog-search" className="catalog-search-label">
                ابحثي في القطع
              </label>
              <input
                id="catalog-search"
                type="search"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                }}
                placeholder="ابحثي بالاسم أو النوع…"
              />
            </div>

            <div className="catalog-filters">
              <div role="group" aria-label="مصدر المنتجات">
                {(
                  [
                    ['all', 'كل المتاجر'],
                    ['Farid Store', 'Farid'],
                    ['Clother Wear', 'Clother'],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    type="button"
                    key={value}
                    aria-pressed={sourceFilter === value}
                    onClick={() => {
                      setSourceFilter(value);
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div role="group" aria-label="نوع القطعة">
                {(
                  [
                    ['all', 'كل الأنواع'],
                    ['top', 'علوي'],
                    ['bottom', 'سفلي'],
                    ['outer', 'عبايات ومعاطف'],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    type="button"
                    key={value}
                    aria-pressed={slotFilter === value}
                    onClick={() => {
                      setSlotFilter(value);
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="catalog-grid">
              {visibleProducts.map((product) => {
                const selected = chosen.has(product.id);
                const stocked = product.sizes.includes(size);
                return (
                  <article className="product-card" key={product.id}>
                    <button
                      className="product-choice"
                      aria-pressed={selected}
                      onClick={() => {
                        toggle(product.id);
                      }}
                    >
                      <span className="product-image">
                        <Image
                          src={product.image}
                          width={product.imageWidth}
                          height={product.imageHeight}
                          sizes="(max-width: 767px) 40vw, 20vw"
                          alt=""
                        />
                        {selected && (
                          <span className="selected-mark">
                            <CheckCircleIcon size={22} weight="fill" />
                            ضمن الطلة
                          </span>
                        )}
                      </span>
                      <span className="product-copy">
                        <span className="product-kind">{product.categoryLabel}</span>
                        <strong>{product.name}</strong>
                        {product.colorLabel && (
                          <span className="product-color">
                            <i style={{ backgroundColor: product.colorHex }} />
                            {product.colorLabel}
                          </span>
                        )}
                        <span className="price numeric">{money(product.price)}</span>
                      </span>
                    </button>
                    <p className={stocked ? 'stock-line' : 'stock-line out'}>
                      {stocked
                        ? `متوفر بمقاس ${size}`
                        : `غير متوفر بمقاس ${size}. المقاسات المتاحة: ${product.sizes.join('، ')}`}
                    </p>
                  </article>
                );
              })}
            </div>
          </section>
        </div>
      </main>

      <div className="outfit-action">
        <div>
          <span>
            {orderable.length} قطع بمقاس {size}
          </span>
          <strong className="numeric">{money(outfitTotal)}</strong>
        </div>
        <button className="primary" onClick={addOutfit} disabled={orderable.length === 0}>
          أضيفي الطلة إلى السلة
        </button>
      </div>

      {unavailable.length > 0 && (
        <p className="availability-note" role="status">
          {unavailable.map((product) => product.name).join('، ')} غير متاح بمقاس {size}،
          لذلك لن يُضاف إلى السلة.
        </p>
      )}

      <CheckoutModal
        isOpen={cartOpen}
        onClose={() => {
          setCartOpen(false);
        }}
        items={cartLines}
        onUpdateQuantity={updateQuantity}
        onClearCart={clearCart}
      />
    </div>
  );
}
