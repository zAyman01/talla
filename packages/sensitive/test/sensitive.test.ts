import { describe, expect, it } from 'vitest';
import { conceal, isSensitive, reveal } from '../src/index.ts';

const PHONE = '+201000000000';

describe('conceal', () => {
  it('keeps the value out of JSON', () => {
    const record = { name: conceal('ليلى'), phone: conceal(PHONE), orderId: 'a1b2' };
    const serialized = JSON.stringify(record);

    expect(serialized).not.toContain(PHONE);
    expect(serialized).not.toContain('201000000000');
    expect(serialized).not.toContain('ليلى');
    // The non-sensitive field is untouched. Concealing everything would be useless.
    expect(serialized).toContain('a1b2');
  });

  it('keeps the value out of string interpolation', () => {
    // Without an explicit toString this reads '[object Object]', which is safe but
    // unhelpful. The placeholder tells a reader what happened.
    expect(`phone=${String(conceal(PHONE))}`).toBe('phone=[sensitive]');
  });

  it('survives nesting inside an error payload', () => {
    const payload = { error: { detail: { buyer: { phone: conceal(PHONE) } } } };
    expect(JSON.stringify(payload)).not.toContain('2010');
  });
});

describe('reveal', () => {
  it('returns the original value, by identity for objects', () => {
    const key = new Uint8Array([1, 2, 3]);
    expect(reveal(conceal(PHONE))).toBe(PHONE);
    expect(reveal(conceal(key))).toBe(key);
  });
});

describe('isSensitive', () => {
  it('recognises concealed values and nothing else', () => {
    expect(isSensitive(conceal(PHONE))).toBe(true);
    expect(isSensitive(PHONE)).toBe(false);
    expect(isSensitive(null)).toBe(false);
    expect(isSensitive(undefined)).toBe(false);
    // A plain object shaped like the interface must not pass: the accessor symbol is
    // module private, so structural typing cannot forge one.
    expect(
      isSensitive({ toJSON: () => '[sensitive]', toString: () => '[sensitive]' }),
    ).toBe(false);
  });
});
