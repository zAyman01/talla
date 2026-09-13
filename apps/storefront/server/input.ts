import type { CheckoutInput } from '@talla/commerce';
import { conceal } from '@talla/sensitive';

const sizes = new Set(['XS', 'S', 'M', 'L', 'XL', 'XXL']);

export function checkoutInput(value: unknown): CheckoutInput {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new Error('ORDER_INVALID_INPUT');
  const input = value as Record<string, unknown>;
  const buyer = input['buyer'];
  if (typeof buyer !== 'object' || buyer === null || Array.isArray(buyer))
    throw new Error('ORDER_INVALID_INPUT');
  const buyerValue = buyer as Record<string, unknown>;
  const rawLines = input['lines'];
  if (!Array.isArray(rawLines)) throw new Error('ORDER_INVALID_INPUT');
  const lines = rawLines.map((raw) => {
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw))
      throw new Error('ORDER_INVALID_INPUT');
    const line = raw as Record<string, unknown>;
    if (
      typeof line['garmentId'] !== 'string' ||
      typeof line['size'] !== 'string' ||
      !sizes.has(line['size']) ||
      typeof line['quantity'] !== 'number'
    )
      throw new Error('ORDER_INVALID_INPUT');
    return {
      garmentId: line['garmentId'],
      size: line['size'] as CheckoutInput['lines'][number]['size'],
      quantity: line['quantity'],
    };
  });
  if (
    typeof input['idempotencyKey'] !== 'string' ||
    typeof input['expectedTotal'] !== 'number' ||
    typeof input['phoneToken'] !== 'string' ||
    (input['cohort'] !== 'viewer' && input['cohort'] !== 'control') ||
    input['privacyNoticeVersion'] !== '2026-09-09' ||
    typeof buyerValue['name'] !== 'string' ||
    typeof buyerValue['phone'] !== 'string' ||
    typeof buyerValue['address'] !== 'string'
  )
    throw new Error('ORDER_INVALID_INPUT');
  return {
    idempotencyKey: input['idempotencyKey'],
    expectedTotal: input['expectedTotal'],
    phoneToken: input['phoneToken'],
    cohort: input['cohort'],
    privacyNoticeVersion: input['privacyNoticeVersion'],
    lines,
    buyer: {
      name: conceal(buyerValue['name']),
      phone: conceal(buyerValue['phone']),
      address: conceal(buyerValue['address']),
    },
  };
}

export function quoteLines(value: unknown): CheckoutInput['lines'] {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new Error('ORDER_INVALID_INPUT');
  return checkoutInput({
    idempotencyKey: '00000000-0000-4000-8000-000000000000',
    expectedTotal: 1,
    phoneToken: 'quote',
    cohort: 'control',
    privacyNoticeVersion: '2026-09-09',
    buyer: { name: 'aa', phone: '+201000000000', address: '0123456789' },
    lines: (value as Record<string, unknown>)['lines'],
  }).lines;
}
