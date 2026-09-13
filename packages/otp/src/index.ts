import { codedError } from '@talla/errors';
import { reveal, type Sensitive } from '@talla/sensitive';

export interface TwilioSmsConfig {
  readonly accountSid: string;
  readonly apiKeySid: string;
  readonly apiKeySecret: Sensitive<string>;
  readonly messagingServiceSid: string;
}

const REQUEST_TIMEOUT_MS = 10_000;

/**
 * Send one Arabic-first verification message through Twilio's Messages API.
 *
 * The recipient and credential leave Talla only at this carrier adapter. Neither is
 * returned in an error, and the verification code stays in the form body rather than
 * appearing in a URL or log line.
 */
export function createTwilioSmsSender(
  config: TwilioSmsConfig,
  request: typeof fetch = fetch,
): (phone: string, code: string) => Promise<void> {
  return async (phone, code) => {
    const body = new URLSearchParams({
      To: phone,
      MessagingServiceSid: config.messagingServiceSid,
      Body: `رمز التأكيد في طلّة: ${code}. صالح لمدة 5 دقائق.`,
    });
    let response: Response;
    try {
      response = await request(
        `https://api.twilio.com/2010-04-01/Accounts/${config.accountSid}/Messages.json`,
        {
          method: 'POST',
          headers: {
            authorization: `Basic ${Buffer.from(
              `${config.apiKeySid}:${reveal(config.apiKeySecret)}`,
            ).toString('base64')}`,
            'content-type': 'application/x-www-form-urlencoded',
          },
          body,
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        },
      );
    } catch (cause) {
      throw codedError('AUTH_OTP_DELIVERY_FAILED', { cause });
    }
    if (!response.ok) throw codedError('AUTH_OTP_DELIVERY_FAILED');
  };
}
