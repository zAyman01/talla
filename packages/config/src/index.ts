import { conceal, type Sensitive } from '@talla/sensitive';

/**
 * The environment, validated once at boot.
 *
 * Two rules shape this file.
 *
 * **Every problem is reported at once, not the first one.** An operator fixing a
 * deployment one failed boot at a time is a self-inflicted outage, and the second missing
 * variable is always discovered after the first is fixed.
 *
 * **No message ever contains a value.** A configuration error that prints the value it
 * rejected prints a database password into a deployment log. Names and lengths only.
 *
 * Validation is hand written, in the style of `packages/garment-spec/src/validate.ts`.
 * A schema library for thirteen variables is a dependency to audit forever.
 *
 * A failure here throws rather than returning a `Result` with a taxonomy code. There is
 * no code for it because there is no caller to hand it to: the process must not start.
 */

export type OtpChannel = 'log' | 'sms';
export type NodeEnv = 'development' | 'test' | 'production';

export interface AssetStorageConfig {
  readonly endpoint: string;
  readonly bucket: string;
  readonly accessKey: Sensitive<string>;
  readonly secretKey: Sensitive<string>;
}

export interface TwilioSmsConfig {
  readonly accountSid: string;
  readonly apiKeySid: string;
  readonly apiKeySecret: Sensitive<string>;
  readonly messagingServiceSid: string;
}

export interface Config {
  readonly nodeEnv: NodeEnv;
  /** The application role. Refused at connect time if it is superuser or BYPASSRLS. */
  readonly databaseUrl: Sensitive<string>;
  /** The migration role. Never the application role (spec 12.3). */
  readonly migrationDatabaseUrl: Sensitive<string>;
  readonly encryptionKey: Sensitive<Uint8Array>;
  readonly indexKey: Sensitive<Uint8Array>;
  readonly phoneSecret: Sensitive<Uint8Array>;
  readonly sessionSecret: Sensitive<Uint8Array>;
  /** The single dedicated admin origin (spec 12.4). */
  readonly adminHost: string;
  /** Parent domain that tenant subdomains hang from. */
  readonly storefrontRootDomain: string;
  readonly asset: AssetStorageConfig;
  readonly otpChannel: OtpChannel;
  /** Present exactly when the selected OTP channel is SMS. */
  readonly twilio: TwilioSmsConfig | undefined;
  /**
   * Days after fulfilment or cancellation before a buyer's contact details are erased.
   *
   * Required, with no default, because spec 12.7 says to define the window before the
   * first pilot and not after. A default would be Talla picking a store's retention
   * policy for it and calling the decision made.
   */
  readonly retentionDays: number;
}

type Env = Readonly<Record<string, string | undefined>>;

const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;
const HOST =
  /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)*(?::\d{1,5})?$/;
const SECRET_BYTES = 32;
const OTP_CHANNELS: readonly OtpChannel[] = ['log', 'sms'];
const NODE_ENVS: readonly NodeEnv[] = ['development', 'test', 'production'];

export function readConfig(env: Env): Config {
  const problems: string[] = [];

  const present = (name: string): string | undefined => {
    const value = env[name];
    if (value === undefined || value.trim() === '') {
      problems.push(`${name} is missing`);
      return undefined;
    }
    return value.trim();
  };

  const postgresUrl = (name: string): Sensitive<string> | undefined => {
    const raw = present(name);
    if (raw === undefined) return undefined;
    let parsed: URL;
    try {
      parsed = new URL(raw);
    } catch {
      problems.push(`${name} is not a URL`);
      return undefined;
    }
    if (parsed.protocol !== 'postgresql:' && parsed.protocol !== 'postgres:') {
      problems.push(`${name} is not a postgresql connection URL`);
      return undefined;
    }
    return conceal(raw);
  };

  /**
   * Returns raw bytes, not a `Sensitive`. The distinctness check below has to compare the
   * four keys, and concealing them first would mean revealing them again to do it, which
   * would make this file a third call site for `reveal` for no reason. They are concealed
   * once, at assembly.
   */
  const secretKey = (name: string): Uint8Array | undefined => {
    const raw = present(name);
    if (raw === undefined) return undefined;
    if (!BASE64.test(raw)) {
      problems.push(`${name} is not base64`);
      return undefined;
    }
    const bytes = new Uint8Array(Buffer.from(raw, 'base64'));
    if (bytes.length !== SECRET_BYTES) {
      // A length is not a value. Saying which length arrived is what makes a truncated
      // secret a five second fix instead of an afternoon.
      problems.push(
        `${name} must decode to ${String(SECRET_BYTES)} bytes, got ${String(bytes.length)}`,
      );
      return undefined;
    }
    return bytes;
  };

  /**
   * A whole number inside a range, or a recorded problem.
   *
   * The bounds match `applyRetention`, which refuses anything outside them: a window of
   * zero deletes a buyer's address before the courier reaches them, and one of several
   * years is a retention policy in name only.
   */
  const wholeNumber = (name: string, least: number, most: number): number | undefined => {
    const raw = present(name);
    if (raw === undefined) return undefined;
    const value = Number(raw);
    if (!Number.isSafeInteger(value) || value < least || value > most) {
      problems.push(
        `${name} must be a whole number between ${String(least)} and ${String(most)}`,
      );
      return undefined;
    }
    return value;
  };

  const hostname = (name: string): string | undefined => {
    const raw = present(name);
    if (raw === undefined) return undefined;
    if (!HOST.test(raw.toLowerCase())) {
      problems.push(`${name} is not a hostname`);
      return undefined;
    }
    return raw.toLowerCase();
  };

  const nodeEnvRaw = env['NODE_ENV']?.trim();
  let nodeEnv: NodeEnv = 'development';
  if (nodeEnvRaw !== undefined && nodeEnvRaw !== '') {
    const match = NODE_ENVS.find((candidate) => candidate === nodeEnvRaw);
    if (match === undefined) {
      problems.push(`NODE_ENV must be one of ${NODE_ENVS.join(', ')}`);
    } else {
      nodeEnv = match;
    }
  }

  const databaseUrl = postgresUrl('TALLA_DATABASE_URL');
  const migrationDatabaseUrl = postgresUrl('TALLA_MIGRATION_DATABASE_URL');
  const encryptionKey = secretKey('TALLA_ENCRYPTION_KEY');
  const indexKey = secretKey('TALLA_INDEX_KEY');
  const phoneSecret = secretKey('TALLA_PHONE_SECRET');
  const sessionSecret = secretKey('TALLA_SESSION_SECRET');
  const adminHost = hostname('TALLA_ADMIN_HOST');
  const storefrontRootDomain = hostname('TALLA_STOREFRONT_ROOT_DOMAIN');
  const assetEndpoint = present('TALLA_ASSET_ENDPOINT');
  const assetBucket = present('TALLA_ASSET_BUCKET');
  const assetAccessKey = present('TALLA_ASSET_ACCESS_KEY');
  const assetSecretKey = present('TALLA_ASSET_SECRET_KEY');

  const retentionDays = wholeNumber('TALLA_RETENTION_DAYS', 1, 365);

  const otpRaw = present('TALLA_OTP_CHANNEL');
  const otpChannel = OTP_CHANNELS.find((candidate) => candidate === otpRaw);
  if (otpRaw !== undefined && otpChannel === undefined) {
    problems.push(`TALLA_OTP_CHANNEL must be one of ${OTP_CHANNELS.join(', ')}`);
  }
  if (otpChannel === 'log' && nodeEnv === 'production') {
    // Codes printed to stdout in production is an authentication bypass for anyone who
    // can read a deployment log, which is a larger group than it sounds.
    problems.push('TALLA_OTP_CHANNEL must not be log when NODE_ENV is production');
  }

  let twilio: TwilioSmsConfig | undefined;
  if (otpChannel === 'sms') {
    const accountSid = present('TALLA_TWILIO_ACCOUNT_SID');
    const apiKeySid = present('TALLA_TWILIO_API_KEY_SID');
    const apiKeySecret = present('TALLA_TWILIO_API_KEY_SECRET');
    const messagingServiceSid = present('TALLA_TWILIO_MESSAGING_SERVICE_SID');

    if (accountSid !== undefined && !/^AC[a-f0-9]{32}$/i.test(accountSid)) {
      problems.push('TALLA_TWILIO_ACCOUNT_SID is not a Twilio account SID');
    }
    if (apiKeySid !== undefined && !/^SK[a-f0-9]{32}$/i.test(apiKeySid)) {
      problems.push('TALLA_TWILIO_API_KEY_SID is not a Twilio API key SID');
    }
    if (apiKeySecret !== undefined && apiKeySecret.length < 20) {
      problems.push('TALLA_TWILIO_API_KEY_SECRET must be at least 20 characters');
    }
    if (
      messagingServiceSid !== undefined &&
      !/^MG[a-f0-9]{32}$/i.test(messagingServiceSid)
    ) {
      problems.push(
        'TALLA_TWILIO_MESSAGING_SERVICE_SID is not a Twilio messaging service SID',
      );
    }

    if (
      accountSid !== undefined &&
      /^AC[a-f0-9]{32}$/i.test(accountSid) &&
      apiKeySid !== undefined &&
      /^SK[a-f0-9]{32}$/i.test(apiKeySid) &&
      apiKeySecret !== undefined &&
      apiKeySecret.length >= 20 &&
      messagingServiceSid !== undefined &&
      /^MG[a-f0-9]{32}$/i.test(messagingServiceSid)
    ) {
      twilio = Object.freeze({
        accountSid,
        apiKeySid,
        apiKeySecret: conceal(apiKeySecret),
        messagingServiceSid,
      });
    }
  }

  // Distinct keys, checked only once all four are present so a missing variable reports
  // as missing rather than as a duplicate.
  const secrets = [encryptionKey, indexKey, phoneSecret, sessionSecret];
  const secretNames = [
    'TALLA_ENCRYPTION_KEY',
    'TALLA_INDEX_KEY',
    'TALLA_PHONE_SECRET',
    'TALLA_SESSION_SECRET',
  ];
  if (secrets.every((secret) => secret !== undefined)) {
    const seen = new Map<string, string>();
    for (const [index, secret] of secrets.entries()) {
      const name = secretNames[index] ?? '';
      const fingerprint = Buffer.from(secret).toString('base64');
      const earlier = seen.get(fingerprint);
      if (earlier !== undefined) {
        // Reusing an AES key as an HMAC key looks tidy and survives review for that
        // reason. It is still one compromise instead of two.
        problems.push(`${name} must differ from ${earlier}`);
      } else {
        seen.set(fingerprint, name);
      }
    }
  }

  if (problems.length > 0) {
    throw new Error(
      `Configuration is invalid, ${String(problems.length)} problem(s):\n${problems
        .map((problem) => `  - ${problem}`)
        .join('\n')}`,
    );
  }

  if (
    databaseUrl === undefined ||
    migrationDatabaseUrl === undefined ||
    encryptionKey === undefined ||
    indexKey === undefined ||
    phoneSecret === undefined ||
    sessionSecret === undefined ||
    adminHost === undefined ||
    storefrontRootDomain === undefined ||
    assetEndpoint === undefined ||
    assetBucket === undefined ||
    assetAccessKey === undefined ||
    assetSecretKey === undefined ||
    otpChannel === undefined ||
    retentionDays === undefined
  ) {
    // Unreachable unless a reader above returned undefined without recording why. That
    // would be a silent hole in the gate, so it fails loudly rather than defaulting.
    throw new Error('Configuration reader returned no value and reported no problem');
  }

  return Object.freeze({
    nodeEnv,
    databaseUrl,
    migrationDatabaseUrl,
    encryptionKey: conceal(encryptionKey),
    indexKey: conceal(indexKey),
    phoneSecret: conceal(phoneSecret),
    sessionSecret: conceal(sessionSecret),
    adminHost,
    storefrontRootDomain,
    asset: Object.freeze({
      endpoint: assetEndpoint,
      bucket: assetBucket,
      accessKey: conceal(assetAccessKey),
      secretKey: conceal(assetSecretKey),
    }),
    otpChannel,
    twilio,
    retentionDays,
  });
}

/** Reads this process's own environment. The entry point every composition root calls. */
export function loadConfig(): Config {
  return readConfig(process.env);
}
