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
import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';

type ProductId = 'tee' | 'jeans';
type Size = 'S' | 'M' | 'L' | 'XL';

interface Product {
  readonly id: ProductId;
  readonly name: string;
  readonly category: 'top' | 'bottom';
  readonly categoryLabel: string;
  readonly image: string;
  readonly imageWidth: number;
  readonly imageHeight: number;
  readonly price: number;
  readonly sizes: readonly Size[];
}

const products: readonly Product[] = [
  {
    id: 'tee',
    name: 'تي شيرت بطبعة قطنية',
    category: 'top',
    categoryLabel: 'قطعة علوية',
    image: '/references/tee-front.webp',
    imageWidth: 1795,
    imageHeight: 2048,
    price: 65000,
    sizes: ['S', 'M', 'L', 'XL'],
  },
  {
    id: 'jeans',
    name: 'جينز أزرق مستقيم',
    category: 'bottom',
    categoryLabel: 'قطعة سفلية',
    image: '/references/jeans.webp',
    imageWidth: 435,
    imageHeight: 650,
    price: 110000,
    sizes: ['S', 'M', 'L'],
  },
] as const;

function money(value: number): string {
  return `${new Intl.NumberFormat('en-US').format(value / 100)} ج.م`;
}

export function Storefront(): ReactNode {
  const [chosen, setChosen] = useState<ReadonlySet<ProductId>>(
    () => new Set<ProductId>(['tee']),
  );
  const [sizes, setSizes] = useState<Record<ProductId, Size>>({ tee: 'M', jeans: 'M' });
  const [cart, setCart] = useState<readonly ProductId[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const cartDialog = useRef<HTMLDialogElement>(null);

  const outfit = useMemo(
    () => products.filter((product) => chosen.has(product.id)),
    [chosen],
  );
  const cartItems = useMemo(
    () => products.filter((product) => cart.includes(product.id)),
    [cart],
  );
  const outfitTotal = outfit.reduce((sum, product) => sum + product.price, 0);
  const cartTotal = cartItems.reduce((sum, product) => sum + product.price, 0);

  useEffect(() => {
    const dialog = cartDialog.current;
    if (!dialog || !cartOpen || dialog.open) return;
    dialog.showModal();
  }, [cartOpen]);

  function toggle(id: ProductId): void {
    setChosen((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function addOutfit(): void {
    setCart(outfit.map((product) => product.id));
    setCartOpen(true);
  }

  return (
    <div className="store-shell">
      <header className="store-header">
        <Link href="/" className="store-name" aria-label="متجر النسيج التجريبي">
          النسيج
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
          <div>
            <p className="eyebrow">تجربة الطلة</p>
            <h1 id="catalog-title">اختاري القطع وشاهديها معاً</h1>
          </div>
          <p>
            هذه الواجهة تستخدم صور الاختبار المتاحة حالياً. عرض الملابس ثلاثي الأبعاد يفتح
            بعد تصوير قطع متجر حقيقي وبناء الأصول المعتمدة.
          </p>
        </section>

        <div className="buyer-layout">
          <section className="outfit-panel" aria-labelledby="outfit-title">
            <div className="section-heading">
              <div>
                <p className="eyebrow">المعاينة</p>
                <h2 id="outfit-title">طلتك الآن</h2>
              </div>
              <span className="reference-label">
                <InfoIcon size={18} weight="regular" />
                صور مرجعية
              </span>
            </div>

            <div className="outfit-stage" aria-live="polite">
              {outfit.length === 0 ? (
                <div className="outfit-empty">
                  <CoatHangerIcon size={36} weight="regular" />
                  <strong>اختاري قطعة للبدء</strong>
                  <span>اضغطي على بطاقة من الكتالوج.</span>
                </div>
              ) : (
                <div className="outfit-images">
                  {outfit.map((product) => (
                    <figure
                      key={product.id}
                      className={`outfit-piece ${product.category}`}
                    >
                      <Image
                        src={product.image}
                        width={product.imageWidth}
                        height={product.imageHeight}
                        sizes="(max-width: 767px) 92vw, 48vw"
                        alt={product.name}
                      />
                      <figcaption>{product.name}</figcaption>
                    </figure>
                  ))}
                </div>
              )}
            </div>

            <div className="selection-summary">
              <span>{outfit.length} من القطع في الطلة</span>
              <strong>{money(outfitTotal)}</strong>
            </div>
          </section>

          <section className="catalog-panel" aria-labelledby="pieces-title">
            <div className="section-heading">
              <div>
                <p className="eyebrow">الكتالوج</p>
                <h2 id="pieces-title">القطع المتاحة للاختبار</h2>
              </div>
              <span className="muted">2 قطعة</span>
            </div>

            <div className="catalog-grid">
              {products.map((product) => {
                const selected = chosen.has(product.id);
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
                        <span className="price">{money(product.price)}</span>
                      </span>
                    </button>
                    <div className="size-row">
                      <span>المقاس</span>
                      <div role="group" aria-label={`مقاس ${product.name}`}>
                        {product.sizes.map((size) => (
                          <button
                            key={size}
                            aria-pressed={sizes[product.id] === size}
                            onClick={() => {
                              setSizes((current) => ({ ...current, [product.id]: size }));
                            }}
                          >
                            {size}
                          </button>
                        ))}
                      </div>
                    </div>
                    {product.id === 'jeans' && (
                      <p className="match-reason">
                        يلائم التي شيرت لأن اللونين متوازنان.
                      </p>
                    )}
                  </article>
                );
              })}
            </div>
          </section>
        </div>
      </main>

      <div className="outfit-action">
        <div>
          <span>{outfit.length} قطع</span>
          <strong>{money(outfitTotal)}</strong>
        </div>
        <button className="primary" onClick={addOutfit} disabled={outfit.length === 0}>
          أضيفي الطلة إلى السلة
        </button>
      </div>

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
              <div>
                <p className="eyebrow">الطلب</p>
                <h2>سلة التسوق</h2>
              </div>
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
                        <span>المقاس {sizes[product.id]}</span>
                        <span className="price">{money(product.price)}</span>
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
                  <strong>{money(cartTotal)}</strong>
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
                  افتح فحوصات الصور والنموذج
                </Link>
              </>
            )}
          </div>
        </dialog>
      )}
    </div>
  );
}
