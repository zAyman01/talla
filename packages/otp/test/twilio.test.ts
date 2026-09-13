import { expect, it, vi } from 'vitest';
import { conceal } from '@talla/sensitive';
import { createTwilioSmsSender } from '../src/index.ts';

const config = {
  accountSid: `AC${'a'.repeat(32)}`,
  apiKeySid: `SK${'b'.repeat(32)}`,
  apiKeySecret: conceal('secret-value-with-enough-length'),
  messagingServiceSid: `MG${'c'.repeat(32)}`,
};

it('sends a form-encoded OTP without putting the recipient or code in the URL', async () => {
  let requestedUrl = '';
  let requestedOptions: RequestInit | undefined;
  const request = vi.fn((url: Parameters<typeof fetch>[0], options?: RequestInit) => {
    requestedUrl =
      typeof url === 'string' ? url : url instanceof URL ? url.href : url.url;
    requestedOptions = options;
    return Promise.resolve(new Response('{}', { status: 201 }));
  });
  const send = createTwilioSmsSender(config, request);

  await send('+201000000000', '123456');

  expect(request).toHaveBeenCalledOnce();
  expect(requestedUrl).not.toContain('+201000000000');
  expect(requestedUrl).not.toContain('123456');
  expect(requestedOptions?.method).toBe('POST');
  expect(requestedOptions?.signal).toBeInstanceOf(AbortSignal);
  const body = requestedOptions?.body;
  expect(body).toBeInstanceOf(URLSearchParams);
  expect(body instanceof URLSearchParams ? body.get('To') : '').toBe('+201000000000');
  expect(body instanceof URLSearchParams ? body.get('Body') : '').toContain('123456');
  expect(requestedOptions?.headers).toEqual(
    expect.objectContaining({
      authorization: `Basic ${Buffer.from(
        `SK${'b'.repeat(32)}:secret-value-with-enough-length`,
      ).toString('base64')}`,
      'content-type': 'application/x-www-form-urlencoded',
    }),
  );
  expect(body instanceof URLSearchParams ? body.get('MessagingServiceSid') : '').toBe(
    `MG${'c'.repeat(32)}`,
  );
});

it('maps carrier and network failures to the delivery taxonomy code', async () => {
  const unavailable = createTwilioSmsSender(config, () =>
    Promise.resolve(new Response('{}', { status: 503 })),
  );
  const disconnected = createTwilioSmsSender(config, () =>
    Promise.reject(new Error('offline')),
  );

  await expect(unavailable('+201000000000', '123456')).rejects.toMatchObject({
    code: 'AUTH_OTP_DELIVERY_FAILED',
  });
  await expect(disconnected('+201000000000', '123456')).rejects.toMatchObject({
    code: 'AUTH_OTP_DELIVERY_FAILED',
  });
});
