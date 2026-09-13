import { getOrderSummary } from '@talla/commerce';
import {
  CheckCircleIcon,
  PackageIcon,
  TruckIcon,
  XCircleIcon,
} from '@phosphor-icons/react/dist/ssr';
import { headers } from 'next/headers';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { getStoreRuntime } from '../../../server/runtime.ts';

const statusCopy = {
  placed: 'تم تسجيل الطلب',
  confirmed: 'أكد المتجر الطلب',
  dispatched: 'الطلب في طريقه إليك',
  fulfilled: 'تم توصيل الطلب',
  cancelled: 'تم إلغاء الطلب',
} as const;

function money(value: number): string {
  return `${new Intl.NumberFormat('en-US').format(value / 100)} ج.م`;
}

export default async function OrderPage({
  params,
}: {
  readonly params: Promise<{ reference: string }>;
}): Promise<ReactNode> {
  const { reference } = await params;
  const host = (await headers()).get('host') ?? '';
  const runtime = getStoreRuntime();
  const store = runtime.storeForHost(host);
  const order = await getOrderSummary(runtime.database, store.tenantId, reference);
  if (!order) notFound();
  const StatusIcon =
    order.status === 'cancelled'
      ? XCircleIcon
      : order.status === 'dispatched'
        ? TruckIcon
        : order.status === 'placed'
          ? PackageIcon
          : CheckCircleIcon;
  return (
    <main id="main" className="order-page">
      <div className="order-status">
        <StatusIcon size={40} weight="regular" />
        <p className="eyebrow">طلب {store.name}</p>
        <h1>{statusCopy[order.status]}</h1>
        <code>{order.reference}</code>
      </div>
      <section aria-labelledby="order-items">
        <h2 id="order-items">تفاصيل الطلب</h2>
        <ul className="order-lines">
          {order.lines.map((line) => (
            <li key={`${line.name}:${line.size}`}>
              <span>
                {line.name}، مقاس {line.size}، عدد {line.quantity}
              </span>
            </li>
          ))}
        </ul>
        <div className="cart-total">
          <span>الإجمالي عند الاستلام</span>
          <strong>{money(order.total)}</strong>
        </div>
      </section>
      <p className="checkout-note">
        لا تعرض هذه الصفحة اسم العميل أو هاتفه أو عنوانه. تواصل مع المتجر واذكر رقم الطلب
        إذا احتجت مساعدة.
      </p>
      <Link className="primary-link" href="/">
        العودة إلى المتجر
      </Link>
    </main>
  );
}
