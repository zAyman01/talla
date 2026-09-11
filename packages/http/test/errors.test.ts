import { describe, expect, it } from 'vitest';
import { codedError } from '@talla/errors';
import { errorResponse, errorResponseFor, statusFor } from '../src/errors.ts';

const TRACE = '9c037b57-b6a9-42a2-bc6b-898a06676bc1';

describe('errorResponse', () => {
  it('answers a store-facing code with its Arabic copy and fix action', async () => {
    const response = errorResponse('INGEST_BACK_PHOTO_MISSING', TRACE);
    const body = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(422);
    expect(body['code']).toBe('INGEST_BACK_PHOTO_MISSING');
    expect((body['user_message'] as Record<string, string>)['ar']).toBe(
      'صورة الخلف مفقودة.',
    );
    expect((body['fix_action'] as Record<string, string>)['ar']).toBeTruthy();
    expect(body['trace_id']).toBe(TRACE);
  });

  it('collapses an internal code so the detail goes to the trace, not the screen', async () => {
    const response = errorResponse('SOLVE_NON_CONVERGENT', TRACE);
    const text = await response.text();

    expect(response.status).toBe(500);
    expect(text).not.toContain('SOLVE_NON_CONVERGENT');
    expect(JSON.parse(text)).toMatchObject({ code: 'INTERNAL_ERROR', trace_id: TRACE });
  });

  it('carries the trace header and refuses to be cached', () => {
    const response = errorResponse('ORDER_RATE_LIMITED', TRACE);
    expect(response.headers.get('x-talla-trace')).toBe(TRACE);
    expect(response.headers.get('cache-control')).toBe('no-store');
  });

  it('has nowhere to put a buyer field', async () => {
    // Spec 16.5. The payload shape is the control: a body with no room for PII cannot
    // carry it by mistake, whatever a future caller passes.
    const body = (await errorResponse('ORDER_PHONE_UNVERIFIED', TRACE).json()) as object;
    expect(Object.keys(body).sort()).toEqual([
      'code',
      'fix_action',
      'http_status',
      'retryable',
      'trace_id',
      'user_message',
    ]);
  });
});

describe('errorResponseFor', () => {
  it('reads the code off a coded throw', async () => {
    const response = errorResponseFor(codedError('STOCK_UNAVAILABLE'), TRACE);
    expect(((await response.json()) as Record<string, unknown>)['code']).toBe(
      'STOCK_UNAVAILABLE',
    );
  });

  it('treats a programmer-error invariant as internal rather than guessing', async () => {
    // "a loft needs at least two rings" is a bug, not something a buyer is told.
    const response = errorResponseFor(
      new Error('a loft needs at least two rings'),
      TRACE,
    );
    const text = await response.text();

    expect(response.status).toBe(500);
    expect(text).not.toContain('loft');
    expect(JSON.parse(text)).toMatchObject({ code: 'INTERNAL_ERROR' });
  });

  it('treats a non-Error throw as internal', () => {
    expect(errorResponseFor('something odd', TRACE).status).toBe(500);
  });
});

describe('statusFor', () => {
  it('returns the documented status for a code', () => {
    // Stated literals, not a second lookup. A helper that reads the catalog the same way
    // statusFor does would assert only that the catalog equals itself.
    expect(statusFor('AUTH_FORBIDDEN')).toBe(403);
    expect(statusFor('INTERNAL_ERROR')).toBe(500);
    expect(statusFor('ORDER_RATE_LIMITED')).toBe(429);
  });
});
