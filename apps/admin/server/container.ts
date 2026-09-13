import { loadConfig } from '@talla/config';
import { createDatabase, createPrivacyBox } from '@talla/database';
import type { Database, PrivacyBox } from '@talla/database';
import { reveal } from '@talla/sensitive';
import { createLogger } from '@talla/observability';
import type { Logger } from '@talla/observability';
import { createTwilioSmsSender } from '@talla/otp';
import { createOwnerAuth } from '@talla/tenancy';
import type { OwnerAuth } from '@talla/tenancy';
import { createAdminRequests } from './request.ts';
import type { AdminRequests } from './request.ts';

/**
 * The composition root for the admin application.
 *
 * It constructs the pool, owner authentication, and the request helpers, and it
 * deliberately does **not** construct checkout. The two applications need different
 * dependencies, which is why each owns its container rather than sharing one that would
 * hand each of them the other's.
 *
 * Nothing here may reach a browser bundle. The guard below is the runtime half of that,
 * and `no-client-into-server` in `.dependency-cruiser.cjs` is the half that fails the
 * build: a component importing this file would ship a connection string and four secrets
 * to every visitor.
 */
if (typeof globalThis.window !== 'undefined') {
  throw new Error('The admin server container was imported into a browser bundle');
}

export interface AdminContainer {
  readonly database: Database;
  readonly privacy: PrivacyBox;
  readonly auth: OwnerAuth;
  readonly requests: AdminRequests;
  readonly logger: Logger;
  readonly adminHost: string;
  readonly isProduction: boolean;
}

let instance: AdminContainer | undefined;

/**
 * Built once, lazily, so that importing a module does not open a connection pool and a
 * misconfigured environment fails on the first request rather than at import time, where
 * the stack trace says nothing useful.
 */
export function container(): AdminContainer {
  if (instance !== undefined) return instance;

  const config = loadConfig();
  const database = createDatabase({ connectionString: reveal(config.databaseUrl) });
  const privacy = createPrivacyBox(reveal(config.encryptionKey), reveal(config.indexKey));
  const logger = createLogger();

  const sendCode =
    config.otpChannel === 'sms'
      ? createTwilioSmsSender(
          config.twilio ??
            (() => {
              throw new Error('Configuration reader returned no Twilio SMS settings');
            })(),
        )
      : (phone: string, code: string): Promise<void> => {
          // The code is the point of this channel. The number is not: the developer already
          // knows which one they typed, and writing it here would put a phone number in a log
          // line to save nobody anything (spec 16.5). A hash prefix is enough to tell two
          // concurrent sign-ins apart.
          logger.warn('auth.otp_issued_to_log', {
            code,
            phone: privacy.phoneHash(phone).slice(0, 8),
          });
          return Promise.resolve();
        };

  const auth = createOwnerAuth({
    database,
    secret: reveal(config.phoneSecret),
    phoneHash: privacy.phoneHash,
    sendCode,
  });

  instance = {
    database,
    privacy,
    auth,
    requests: createAdminRequests({ database, auth, logger }),
    logger,
    adminHost: config.adminHost,
    isProduction: config.nodeEnv === 'production',
  };
  return instance;
}
