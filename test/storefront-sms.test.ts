import { expect, it, vi } from 'vitest';
import { createTwilioSender } from '../apps/storefront/server/sms.ts';

it('sends a form-encoded OTP through Twilio without putting it in the URL', async () => {
  let requestedUrl = '';
  let requestedOptions: RequestInit | undefined;
  const request = vi.fn((url: Parameters<typeof fetch>[0], options?: RequestInit) => {
    requestedUrl =
      typeof url === 'string' ? url : url instanceof URL ? url.href : url.url;
    requestedOptions = options;
    return Promise.resolve(new Response('{}', { status: 201 }));
  });
  const send = createTwilioSender(
    {
      accountSid: `AC${'a'.repeat(32)}`,
      apiKeySid: `SK${'b'.repeat(32)}`,
      apiKeySecret: 'secret-value-with-enough-length',
      messagingServiceSid: `MG${'c'.repeat(32)}`,
    },
    request,
  );
  await send('+201000000000', '123456');
  expect(request).toHaveBeenCalledOnce();
  expect(requestedUrl).not.toContain('123456');
  expect(requestedOptions?.method).toBe('POST');
  const body = requestedOptions?.body;
  expect(body).toBeInstanceOf(URLSearchParams);
  expect(body instanceof URLSearchParams ? body.toString() : '').toContain(
    'To=%2B201000000000',
  );
  expect(body instanceof URLSearchParams ? body.toString() : '').toContain('123456');
});

it('turns provider failures into a delivery failure', async () => {
  const send = createTwilioSender(
    {
      accountSid: `AC${'a'.repeat(32)}`,
      apiKeySid: `SK${'b'.repeat(32)}`,
      apiKeySecret: 'secret-value-with-enough-length',
      messagingServiceSid: `MG${'c'.repeat(32)}`,
    },
    () => Promise.resolve(new Response('{}', { status: 503 })),
  );
  await expect(send('+201000000000', '123456')).rejects.toThrow(
    'AUTH_OTP_DELIVERY_FAILED',
  );
});
