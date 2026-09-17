'use client';

import {
  BagIcon,
  CheckCircleIcon,
  MinusIcon,
  PlusIcon,
  XIcon,
} from '@phosphor-icons/react';
import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import type { ReactNode, SyntheticEvent } from 'react';
import type { BodySize } from '@talla/shared';

export interface CheckoutLineItem {
  readonly id: string;
  readonly name: string;
  readonly size: BodySize;
  readonly quantity: number;
  readonly price: number;
  readonly image: string;
  readonly imageWidth: number;
  readonly imageHeight: number;
}

interface CheckoutModalProps {
  readonly isOpen: boolean;
  readonly onClose: () => void;
  readonly items: readonly CheckoutLineItem[];
  readonly onUpdateQuantity: (id: string, size: BodySize, delta: number) => void;
  readonly onClearCart: () => void;
}

type CheckoutStep = 'cart' | 'details' | 'verify' | 'confirmed';

function money(value: number): string {
  return `${new Intl.NumberFormat('en-US').format(value / 100)} ج.م`;
}

export function CheckoutModal({
  isOpen,
  onClose,
  items,
  onUpdateQuantity,
  onClearCart,
}: CheckoutModalProps): ReactNode {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [step, setStep] = useState<CheckoutStep>('cart');
  const [buyerName, setBuyerName] = useState('');
  const [buyerPhone, setBuyerPhone] = useState('');
  const [buyerCity, setBuyerCity] = useState('');
  const [buyerAddress, setBuyerAddress] = useState('');
  const [privacyAccepted, setPrivacyAccepted] = useState(true);

  // OTP state
  const [challengeId, setChallengeId] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [orderReference, setOrderReference] = useState('');

  const cartTotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (isOpen && !dialog.open) {
      dialog.showModal();
    } else if (!isOpen && dialog.open) {
      dialog.close();
    }
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      setErrorMessage('');
      setIsSubmitting(false);
      if (items.length === 0 && step !== 'confirmed') {
        setStep('cart');
      }
    }
  }, [isOpen, items.length, step]);

  async function handleStartVerification(e: SyntheticEvent): Promise<void> {
    e.preventDefault();
    if (!buyerPhone || !buyerName || !buyerAddress || !buyerCity) {
      setErrorMessage('يرجى ملء جميع الحقول المطلوبة.');
      return;
    }
    if (!privacyAccepted) {
      setErrorMessage('يرجى الموافقة على سياسة الخصوصية لإتمام الطلب.');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage('');

    try {
      const res = await fetch('/api/phone/start', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ phone: buyerPhone }),
      });

      const data = (await res.json()) as { challengeId?: string; error?: string };
      if (!res.ok || !data.challengeId) {
        setErrorMessage(data.error ?? 'تعذر إرسال رمز التحقق. يرجى مراجعة رقم الهاتف.');
        setIsSubmitting(false);
        return;
      }

      setChallengeId(data.challengeId);
      setStep('verify');
    } catch {
      setErrorMessage('تعذر الاتصال بالخادم. يرجى المحاولة مرة أخرى.');
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleConfirmOrder(e: SyntheticEvent): Promise<void> {
    e.preventDefault();
    if (!otpCode) {
      setErrorMessage('يرجى إدخال رمز التأكيد.');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage('');

    try {
      // 1. Verify phone
      const verifyRes = await fetch('/api/phone/verify', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          challengeId,
          phone: buyerPhone,
          code: otpCode.trim(),
        }),
      });

      const verifyData = (await verifyRes.json()) as { token?: string; error?: string };
      if (!verifyRes.ok || !verifyData.token) {
        setErrorMessage(verifyData.error ?? 'رمز التأكيد غير صحيح أو انتهت صلاحيته.');
        setIsSubmitting(false);
        return;
      }

      // 2. Place Order
      const fullAddress = `${buyerCity.trim()} - ${buyerAddress.trim()}`;
      const orderLines = items.map((item) => ({
        garmentId: item.id,
        size: item.size,
        quantity: item.quantity,
      }));

      const idempotencyKey = crypto.randomUUID();

      const orderRes = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          idempotencyKey,
          lines: orderLines,
          expectedTotal: cartTotal,
          name: buyerName.trim(),
          phone: buyerPhone.trim(),
          address: fullAddress,
          phoneToken: verifyData.token,
          cohort: 'viewer',
        }),
      });

      const orderData = (await orderRes.json()) as { reference?: string; error?: string };
      if (!orderRes.ok || !orderData.reference) {
        setErrorMessage(orderData.error ?? 'تعذر تسجيل الطلب. يرجى المحاولة لاحقاً.');
        setIsSubmitting(false);
        return;
      }

      setOrderReference(orderData.reference);
      setStep('confirmed');
      onClearCart();
    } catch {
      setErrorMessage('حدث خطأ أثناء تأكيد الطلب. يرجى المحاولة مرة أخرى.');
    } finally {
      setIsSubmitting(false);
    }
  }

  if (!isOpen) return null;

  return (
    <dialog
      ref={dialogRef}
      className="cart-dialog"
      aria-label="سلة التسوق وإتمام الطلب"
      onClose={() => {
        onClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div className="cart-sheet" role="document">
        <div className="cart-heading">
          <h2>
            {step === 'cart'
              ? 'سلة التسوق'
              : step === 'details'
                ? 'بيانات التوصيل'
                : step === 'verify'
                  ? 'تأكيد رقم الهاتف'
                  : 'تم استلام طلبك'}
          </h2>
          <button
            type="button"
            className="icon-button"
            aria-label="إغلاق السلة"
            onClick={() => {
              onClose();
            }}
          >
            <XIcon size={22} weight="regular" />
          </button>
        </div>

        {step === 'cart' && (
          <>
            {items.length === 0 ? (
              <div className="cart-empty">
                <BagIcon size={36} weight="regular" />
                <strong>السلة فارغة</strong>
                <span>أضيفي طلة من الكتالوج أولاً.</span>
              </div>
            ) : (
              <>
                <ul className="cart-list" aria-label="محتويات السلة">
                  {items.map((item) => (
                    <li key={`${item.id}:${item.size}`}>
                      <Image
                        src={item.image}
                        width={item.imageWidth}
                        height={item.imageHeight}
                        sizes="64px"
                        alt=""
                      />
                      <div>
                        <strong>{item.name}</strong>
                        <span>المقاس {item.size}</span>
                        <span className="price numeric">{money(item.price * item.quantity)}</span>
                      </div>
                      <div className="quantity" role="group" aria-label={`كمية ${item.name}`}>
                        <button
                          type="button"
                          aria-label={`تقليل كمية ${item.name}`}
                          onClick={() => {
                            onUpdateQuantity(item.id, item.size, -1);
                          }}
                        >
                          <MinusIcon size={16} />
                        </button>
                        <span className="numeric">{item.quantity}</span>
                        <button
                          type="button"
                          aria-label={`زيادة كمية ${item.name}`}
                          onClick={() => {
                            onUpdateQuantity(item.id, item.size, 1);
                          }}
                        >
                          <PlusIcon size={16} />
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
                <div className="cart-total">
                  <span>الإجمالي (الدفع عند الاستلام)</span>
                  <strong className="numeric">{money(cartTotal)}</strong>
                </div>
                <button
                  type="button"
                  className="primary full-button"
                  onClick={() => {
                    setStep('details');
                  }}
                >
                  متابعة الطلب والدفع عند الاستلام
                </button>
                <Link
                  href="/lab"
                  className="lab-link"
                  onClick={() => {
                    onClose();
                  }}
                >
                  افتح فحوصات الصور والأصول المرجعية
                </Link>
              </>
            )}
          </>
        )}

        {step === 'details' && (
          <form
            className="checkout-form"
            onSubmit={(e) => {
              void handleStartVerification(e);
            }}
          >
            <label htmlFor="checkout-name">
              الاسم بالكامل
              <input
                id="checkout-name"
                type="text"
                required
                value={buyerName}
                onChange={(e) => {
                  setBuyerName(e.target.value);
                }}
                placeholder="الاسم الثلاثي"
              />
            </label>

            <label htmlFor="checkout-phone">
              رقم الهاتف (للتواصل وتأكيد الطلب)
              <input
                id="checkout-phone"
                type="tel"
                dir="ltr"
                required
                value={buyerPhone}
                onChange={(e) => {
                  setBuyerPhone(e.target.value);
                }}
                placeholder="01xxxxxxxxx"
              />
            </label>

            <label htmlFor="checkout-city">
              المحافظة أو المدينة
              <input
                id="checkout-city"
                type="text"
                required
                value={buyerCity}
                onChange={(e) => {
                  setBuyerCity(e.target.value);
                }}
                placeholder="مثال: القاهرة"
              />
            </label>

            <label htmlFor="checkout-address">
              العنوان بالتفصيل
              <textarea
                id="checkout-address"
                rows={3}
                required
                value={buyerAddress}
                onChange={(e) => {
                  setBuyerAddress(e.target.value);
                }}
                placeholder="اسم الشارع، رقم العمارة، رقم الشقة أو علامة مميزة"
              />
            </label>

            <label className="privacy-check" htmlFor="checkout-privacy">
              <input
                id="checkout-privacy"
                type="checkbox"
                checked={privacyAccepted}
                onChange={(e) => {
                  setPrivacyAccepted(e.target.checked);
                }}
                required
              />
              <span>أوافق على سياسة الخصوصية واستخدام البيانات لتوصيل الطلب فقط.</span>
            </label>

            {errorMessage && (
              <div className="checkout-error" role="alert">
                <span>{errorMessage}</span>
              </div>
            )}

            <div className="cart-total">
              <span>الإجمالي عند الاستلام</span>
              <strong className="numeric">{money(cartTotal)}</strong>
            </div>

            <div className="checkout-actions">
              <button
                type="button"
                className="secondary"
                onClick={() => {
                  setStep('cart');
                }}
                disabled={isSubmitting}
              >
                العودة للسلة
              </button>
              <button
                type="submit"
                className="primary"
                disabled={isSubmitting}
              >
                {isSubmitting ? 'جارٍ الإرسال…' : 'إرسال رمز التأكيد'}
              </button>
            </div>
          </form>
        )}

        {step === 'verify' && (
          <form
            className="checkout-form"
            onSubmit={(e) => {
              void handleConfirmOrder(e);
            }}
          >
            <p className="checkout-note">
              أدخل رمز التأكيد المكون من 6 أرقام المرسل إلى هاتفك ({buyerPhone}).
            </p>

            <label htmlFor="checkout-otp">
              رمز التحقق
              <input
                id="checkout-otp"
                type="text"
                dir="ltr"
                maxLength={6}
                required
                value={otpCode}
                onChange={(e) => {
                  setOtpCode(e.target.value);
                }}
                placeholder="123456"
                autoFocus
              />
            </label>

            {errorMessage && (
              <div className="checkout-error" role="alert">
                <span>{errorMessage}</span>
              </div>
            )}

            <div className="cart-total">
              <span>الإجمالي المستحق نقداً</span>
              <strong className="numeric">{money(cartTotal)}</strong>
            </div>

            <div className="checkout-actions">
              <button
                type="button"
                className="secondary"
                onClick={() => {
                  setStep('details');
                }}
                disabled={isSubmitting}
              >
                تعديل البيانات
              </button>
              <button
                type="submit"
                className="primary"
                disabled={isSubmitting || otpCode.length < 4}
              >
                {isSubmitting ? 'جارٍ التأكيد…' : 'تأكيد الطلب نهائياً'}
              </button>
            </div>
          </form>
        )}

        {step === 'confirmed' && (
          <div className="checkout-success" aria-live="polite">
            <CheckCircleIcon size={48} weight="fill" />
            <h3>تم تسجيل طلبك بنجاح!</h3>
            <p className="muted">
              رقم الطلب المرجعي الخاص بك هو:
            </p>
            <code>{orderReference}</code>
            <p className="checkout-note">
              سيتواصل معك مندوب المتجر لتأكيد موعد التوصيل والدفع عند الاستلام.
            </p>
            <Link
              href={`/orders/${orderReference}`}
              className="primary full-button"
              onClick={() => {
                onClose();
              }}
            >
              عرض تفاصيل وحالة الطلب
            </Link>
          </div>
        )}
      </div>
    </dialog>
  );
}
