'use client';

import {
  BagIcon,
  CheckCircleIcon,
  CoatHangerIcon,
  InfoIcon,
  MinusIcon,
  PlusIcon,
  XIcon,
} from '@phosphor-icons/react';
import dynamic from 'next/dynamic';
import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { BodySize } from '@talla/shared';
import type { FitVerdict } from '@talla/blocks';
import { garmentFit } from '@talla/blocks';
import { TIER_BUDGET, probeTier } from '@talla/viewer';
import type { DeviceTier } from '@talla/shared';
import type { DressedGarment } from '@talla/viewer';
import type { CatalogProduct } from '../product.ts';
import { initialOutfit, toggleOutfit } from '../outfit.ts';

const Mannequin = dynamic(() => import('./mannequin.tsx').then((m) => m.Mannequin), {
  ssr: false,
  loading: () => <div className="viewer-stage stage-skeleton" aria-hidden="true" />,
});

/**
 * The catalogue arrives as a prop from the server component, read from PostgreSQL under
 * the tenant transaction. It used to be a two-element array declared right here, which
 * meant the page could not show a store anything it actually sells.
 */
type Product = CatalogProduct;
type ProductId = string;
type CatalogSourceFilter = 'all' | 'Farid Store' | 'Clother Wear';
type CatalogSlotFilter = 'all' | Product['slot'];

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
  const [cart, setCart] = useState<readonly ProductId[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [viewerAvailable, setViewerAvailable] = useState(true);
  const [sourceFilter, setSourceFilter] = useState<CatalogSourceFilter>('Farid Store');
  const [slotFilter, setSlotFilter] = useState<CatalogSlotFilter>('all');
  /**
   * The device tier, decided before the renderer is fetched (spec 11.2).
   *
   * `undefined` means not decided yet, which is the state the server renders in: the
   * probe reads a WebGL context and a connection, and neither exists there.
   *
   * The order matters more than it looks. Mounting the viewer and letting it report back
   * that this device cannot run it costs a chunk of Three.js, a WebGL context and a
   * render, all of it on the devices least able to afford any of the three, and only then
   * starts loading the photographs a tier C buyer was always going to see. Asking first
   * costs one synchronous probe. `probeTier` comes from the viewer module's index, which
   * carries no renderer, so this decision does not drag the engine in with it.
   */
  const [tier, setTier] = useState<DeviceTier | undefined>(undefined);
  const cartDialog = useRef<HTMLDialogElement>(null);

  const outfit = useMemo(
    () => products.filter((product) => chosen.has(product.id)),
    [chosen],
  );
  const cartItems = useMemo(
    () => products.filter((product) => cart.includes(product.id)),
    [cart],
  );
  const visibleProducts = useMemo(
    () =>
      products.filter(
        (product) =>
          (sourceFilter === 'all' || product.source?.merchant === sourceFilter) &&
          (slotFilter === 'all' || product.slot === slotFilter),
      ),
    [products, slotFilter, sourceFilter],
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
   * Fit is always read at the base layer. The `over` variant carries the clearance a top
   * needs to fall past a waistband, which is a rendering concern; quoting it would make a
   * tee report a looser fit the moment a buyer adds jeans, and the tee has not changed.
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

  /**
   * Whether the figure is photographs rather than a render.
   *
   * Two ways to get here and one answer: a tier the ladder sends to the fallback, and a
   * context the viewer had and lost. Deriving it once is what keeps the stage and the
   * note beneath it from disagreeing about which of the two a buyer is looking at.
   */
  const photographic =
    tier !== undefined && (!viewerAvailable || TIER_BUDGET[tier].usesTurntable);

  const unavailable = outfit.filter((product) => !product.sizes.includes(size));
  const orderable = outfit.filter((product) => product.sizes.includes(size));
  const outfitTotal = orderable.reduce((sum, product) => sum + product.price, 0);
  const cartTotal = cartItems.reduce((sum, product) => sum + product.price, 0);

  useEffect(() => {
    setTier(probeTier());
  }, []);

  useEffect(() => {
    const dialog = cartDialog.current;
    if (!dialog || !cartOpen || dialog.open) return;
    dialog.showModal();
  }, [cartOpen]);

  function toggle(id: ProductId): void {
    setChosen((current) => toggleOutfit(products, current, id));
  }

  function addOutfit(): void {
    setCart(orderable.map((product) => product.id));
    setCartOpen(true);
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
          aria-label={`السلة، ${String(cart.length)} قطع`}
        >
          <BagIcon size={22} weight="regular" />
          <span>السلة</span>
          <strong>{cart.length}</strong>
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
              /**
               * The photographs, and the first thing rendered.
               *
               * They are in the server's HTML, so the browser's preload scanner finds
               * them before any JavaScript runs. The alternative, an empty stage until
               * the tier is known, put the largest element on the page behind the whole
               * client chain: bundle, hydrate, probe, then render, then fetch. That is
               * 3.6 s on the throttled reference profile against a 2.5 s budget, and it
               * is slowest on the tier C devices that never get anything else.
               *
               * On tier A and B the canvas replaces them once the renderer is ready, so
               * they double as the poster frame for a viewer that is still loading.
               */
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
                        // This is the viewer, for the buyers who cannot have one. It is
                        // the largest element on their screen and the one the page is
                        // waiting on, so it is never lazy.
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
          </section>

          <section className="catalog-panel" aria-labelledby="pieces-title">
            <div className="section-heading">
              <h2 id="pieces-title">القطع المتاحة</h2>
              <span className="muted">
                {visibleProducts.length} من {products.length} قطعة
              </span>
            </div>

            <div className="catalog-filters">
              <div role="group" aria-label="مصدر المنتجات">
                {(
                  [
                    ['Farid Store', 'Farid'],
                    ['Clother Wear', 'Clother'],
                    ['all', 'الكل'],
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

      {cartOpen && (
        <dialog
          ref={cartDialog}
          className="cart-dialog"
          aria-label="سلة التسوق"
          onClose={() => {
            setCartOpen(false);
          }}
          onClick={(event) => {
            if (event.target === event.currentTarget) event.currentTarget.close();
          }}
        >
          <div className="cart-sheet">
            <div className="cart-heading">
              <h2>سلة التسوق</h2>
              <button
                className="icon-button"
                aria-label="إغلاق السلة"
                autoFocus
                onClick={() => {
                  cartDialog.current?.close();
                }}
              >
                <XIcon size={22} weight="regular" />
              </button>
            </div>
            {cartItems.length === 0 ? (
              <div className="cart-empty">
                <BagIcon size={32} weight="regular" />
                <strong>السلة فارغة</strong>
                <span>أضيفي طلة من الكتالوج أولاً.</span>
              </div>
            ) : (
              <>
                <ul className="cart-list">
                  {cartItems.map((product) => (
                    <li key={product.id}>
                      <Image
                        src={product.image}
                        width={product.imageWidth}
                        height={product.imageHeight}
                        sizes="64px"
                        alt=""
                      />
                      <div>
                        <strong>{product.name}</strong>
                        <span>المقاس {size}</span>
                        <span className="price numeric">{money(product.price)}</span>
                      </div>
                      <div className="quantity" aria-label="الكمية">
                        <button aria-label="تقليل الكمية" disabled>
                          <MinusIcon size={16} />
                        </button>
                        <span>1</span>
                        <button aria-label="زيادة الكمية" disabled>
                          <PlusIcon size={16} />
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
                <div className="cart-total">
                  <span>الإجمالي</span>
                  <strong className="numeric">{money(cartTotal)}</strong>
                </div>
                <div className="checkout-disabled">
                  <InfoIcon size={20} weight="regular" />
                  <p>
                    تسجيل الطلب متوقف في متجر الاختبار حتى ربط خدمة تأكيد رقم الهاتف. لن
                    تُحفظ بيانات شخصية من هذه الصفحة.
                  </p>
                </div>
                <button className="primary full-button" disabled>
                  تأكيد الهاتف وإتمام الطلب
                </button>
                <Link href="/lab" className="lab-link">
                  افتح فحوصات الصور والأصول المرجعية
                </Link>
              </>
            )}
          </div>
        </dialog>
      )}
    </div>
  );
}
