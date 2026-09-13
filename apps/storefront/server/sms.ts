export interface TwilioSmsConfig {
  readonly accountSid: string;
  readonly apiKeySid: string;
  readonly apiKeySecret: string;
  readonly messagingServiceSid: string;
}

function requireMatch(value: string, pattern: RegExp, name: string): string {
  if (!pattern.test(value)) throw new Error(`Invalid ${name}`);
  return value;
}

export function createTwilioSender(
  config: TwilioSmsConfig,
  request: typeof fetch = fetch,
): (phone: string, code: string) => Promise<void> {
  const accountSid = requireMatch(config.accountSid, /^AC[a-f0-9]{32}$/i, 'account SID');
  const apiKeySid = requireMatch(config.apiKeySid, /^SK[a-f0-9]{32}$/i, 'API key SID');
  const messagingServiceSid = requireMatch(
    config.messagingServiceSid,
    /^MG[a-f0-9]{32}$/i,
    'messaging service SID',
  );
  if (config.apiKeySecret.length < 20) throw new Error('Invalid API key secret');

  return async (phone, code) => {
    const body = new URLSearchParams({
      To: phone,
      MessagingServiceSid: messagingServiceSid,
      Body: `رمز تأكيد طلبك في طلّة: ${code}. صالح لمدة 5 دقائق.`,
    });
    const response = await request(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
      {
        method: 'POST',
        headers: {
          authorization: `Basic ${Buffer.from(`${apiKeySid}:${config.apiKeySecret}`).toString('base64')}`,
          'content-type': 'application/x-www-form-urlencoded',
        },
        body,
        signal: AbortSignal.timeout(10_000),
      },
    );
    if (!response.ok) throw new Error('AUTH_OTP_DELIVERY_FAILED');
  };
}
