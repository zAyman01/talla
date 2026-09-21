'use client';

import {
  ArrowSquareOutIcon,
  CaretLeftIcon,
  CaretRightIcon,
  XIcon,
} from '@phosphor-icons/react';
import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { CatalogProduct } from '../product.ts';

interface ProductDetailsProps {
  readonly product: CatalogProduct | undefined;
  readonly onClose: () => void;
  readonly onTryOn: (id: string) => void;
  readonly selected: boolean;
}

function money(value: number): string {
  return `${new Intl.NumberFormat('en-US').format(value / 100)} ج.م`;
}

export function ProductDetails({
  product,
  onClose,
  onTryOn,
  selected,
}: ProductDetailsProps): ReactNode {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [imageIndex, setImageIndex] = useState(0);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (product && dialog && !dialog.open) dialog.showModal();
    if (!product && dialog?.open) dialog.close();
    setImageIndex(0);
  }, [product]);

  if (!product) return null;
  const images =
    product.images.length > 0
      ? product.images
      : [
          {
            url: product.image,
            width: product.imageWidth,
            height: product.imageHeight,
            alt: product.name,
          },
        ];
  const activeImage = images[imageIndex] ?? images[0];
  if (!activeImage) return null;
  const unavailableSizes = product.allSourceSizes.filter(
    (candidate) => !product.sourceSizes.includes(candidate),
  );

  return (
    <dialog
      ref={dialogRef}
      className="product-dialog"
      aria-label={`تفاصيل ${product.name}`}
      onClose={onClose}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="product-sheet" role="document">
        <header className="product-detail-heading">
          <div>
            <span>{product.source?.merchant}</span>
            <h2>{product.name}</h2>
          </div>
          <button
            type="button"
            className="icon-button"
            aria-label="إغلاق التفاصيل"
            onClick={onClose}
          >
            <XIcon size={22} />
          </button>
        </header>

        <div className="product-detail-layout">
          <section className="product-gallery" aria-label={`صور ${product.name}`}>
            <div className="product-gallery-main">
              <Image
                src={activeImage.url}
                width={activeImage.width}
                height={activeImage.height}
                sizes="(max-width: 767px) 92vw, 52vw"
                alt={activeImage.alt}
              />
              {images.length > 1 && (
                <div className="gallery-controls">
                  <button
                    type="button"
                    aria-label="الصورة السابقة"
                    onClick={() => {
                      setImageIndex(
                        (current) => (current - 1 + images.length) % images.length,
                      );
                    }}
                  >
                    <CaretRightIcon size={22} />
                  </button>
                  <span className="numeric">
                    {imageIndex + 1} / {images.length}
                  </span>
                  <button
                    type="button"
                    aria-label="الصورة التالية"
                    onClick={() => {
                      setImageIndex((current) => (current + 1) % images.length);
                    }}
                  >
                    <CaretLeftIcon size={22} />
                  </button>
                </div>
              )}
            </div>
            {images.length > 1 && (
              <div className="product-thumbnails" aria-label="كل صور المنتج">
                {images.map((image, index) => (
                  <button
                    type="button"
                    key={`${image.url}:${String(index)}`}
                    aria-label={`عرض الصورة ${String(index + 1)}`}
                    aria-pressed={imageIndex === index}
                    onClick={() => {
                      setImageIndex(index);
                    }}
                  >
                    <Image
                      src={image.url}
                      width={image.width}
                      height={image.height}
                      sizes="72px"
                      alt=""
                      loading="lazy"
                    />
                  </button>
                ))}
              </div>
            )}
          </section>

          <section className="product-facts">
            <div className="detail-price">
              <strong className="numeric">{money(product.price)}</strong>
              {product.compareAtPrice && (
                <del className="numeric">{money(product.compareAtPrice)}</del>
              )}
            </div>

            {product.description && (
              <p className="product-description">{product.description}</p>
            )}

            <dl className="source-options">
              <div>
                <dt>المقاسات المتاحة</dt>
                <dd>
                  {product.sourceSizes.length > 0
                    ? product.sourceSizes.join('، ')
                    : 'نفد المخزون'}
                </dd>
              </div>
              {unavailableSizes.length > 0 && (
                <div>
                  <dt>مقاسات غير متاحة حاليًا</dt>
                  <dd>{unavailableSizes.join('، ')}</dd>
                </div>
              )}
              {product.colors.length > 0 && (
                <div>
                  <dt>الألوان المنشورة</dt>
                  <dd>{product.colors.join('، ')}</dd>
                </div>
              )}
              <div>
                <dt>الصور</dt>
                <dd>{product.imageCount} صورة من صفحة المنتج</dd>
              </div>
            </dl>

            <div className="product-detail-actions">
              <button
                type="button"
                className="primary"
                disabled={product.sourceSizes.length === 0}
                onClick={() => {
                  onTryOn(product.id);
                }}
              >
                {selected ? 'إزالة من الطلة' : 'جرّبيها على المانيكان'}
              </button>
              {product.source && (
                <a href={product.source.productUrl} target="_blank" rel="noreferrer">
                  صفحة المنتج الأصلية
                  <ArrowSquareOutIcon size={18} />
                </a>
              )}
            </div>
          </section>
        </div>
      </div>
    </dialog>
  );
}
