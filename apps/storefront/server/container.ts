import { loadConfig } from '@talla/config';
import { createDatabase, createPrivacyBox } from '@talla/database';
import type { Database, PrivacyBox } from '@talla/database';
import { reveal } from '@talla/sensitive';
import { createLogger } from '@talla/observability';
import type { Logger } from '@talla/observability';
import { createTwilioSmsSender } from '@talla/otp';
import {
  createCheckout,
  createPhoneVerification,
  verifyPhoneToken,
} from '@talla/commerce';
import type { CheckoutService, PhoneVerification } from '@talla/commerce';
import { createTenantRequests } from './request.ts';
import type { TenantRequests } from './request.ts';

/**
 * The composition root for the storefront.
 *
 * It constructs checkout and buyer phone verification, and it deliberately does not
 * construct owner authentication or ingest: those belong to admin, and an application
 * that cannot reach them cannot be tricked into using them.
 *
 * Nothing here may reach a browser bundle. The guard is the runtime half; the
 * `no-client-into-server` rule in `.dependency-cruiser.cjs` is the half that fails the
 * build before anyone runs it.
 */
if (typeof globalThis.window !== 'undefined') {
  throw new Error('The storefront server container was imported into a browser bundle');
}

export interface StorefrontContainer {
  readonly database: Database;
  readonly privacy: PrivacyBox;
  readonly checkout: CheckoutService;
  readonly phone: PhoneVerification;
  readonly requests: TenantRequests;
  readonly logger: Logger;
  readonly isProduction: boolean;
}

let instance: StorefrontContainer | undefined;

export function container(): StorefrontContainer {
  if (instance !== undefined) return instance;

  const config = loadConfig();
  const database = createDatabase({ connectionString: reveal(config.databaseUrl) });
  const privacy = createPrivacyBox(reveal(config.encryptionKey), reveal(config.indexKey));
  const logger = createLogger();
  const phoneSecret = reveal(config.phoneSecret);

  const sendCode =
    config.otpChannel === 'sms'
      ? createTwilioSmsSender(
          config.twilio ??
            (() => {
              throw new Error('Configuration reader returned no Twilio SMS settings');
            })(),
        )
      : (number: string, code: string): Promise<void> => {
          // The code, never the number. A buyer's phone in a deployment log is the leak the
          // whole `Sensitive` wrapper exists to prevent (spec 16.5).
          logger.warn('commerce.otp_issued_to_log', {
            code,
            phone: privacy.phoneHash(number).slice(0, 8),
          });
          return Promise.resolve();
        };

  const phone = createPhoneVerification({
    database,
    secret: phoneSecret,
    phoneHash: privacy.phoneHash,
    sendCode,
  });

  instance = {
    database,
    privacy,
    phone,
    checkout: createCheckout({
      database,
      sealBuyer: privacy.sealBuyer,
      /**
       * The token was minted against this same hash at verification time, so the check
       * needs the index and not the number. That is why `verifyPhoneToken` takes a hash:
       * the plaintext buys nothing here and would be one more place it exists.
       */
      verifyPhone: (token, phoneHash, tenantId) =>
        Promise.resolve(verifyPhoneToken(phoneSecret, token, phoneHash, tenantId)),
    }),
    requests: createTenantRequests({
      database,
      rootDomain: config.storefrontRootDomain,
      logger,
    }),
    logger,
    isProduction: config.nodeEnv === 'production',
  };
  return instance;
}
