import { createDatabase, createPrivacyBox } from '@talla/database';
import type { Database, PrivacyBox } from '@talla/database';
import {
  createCheckout,
  createPhoneVerification,
  verifyPhoneToken,
} from '@talla/commerce';
import type { CheckoutService, PhoneVerification } from '@talla/commerce';
import { subdomainFromHost } from '@talla/tenancy';
import { assignExperiment } from '@talla/trial/assignment';
import type { Assignment } from '@talla/trial/assignment';
import { createTwilioSender } from './sms.ts';

export interface StoreConfig {
  readonly tenantId: string;
  readonly subdomain: string;
  readonly name: string;
  readonly whatsappPhone: string | undefined;
  readonly publicOrigin: string | undefined;
}

export interface StoreRuntime {
  readonly database: Database;
  readonly privacy: PrivacyBox;
  readonly checkout: CheckoutService;
  readonly phone: PhoneVerification;
  readonly developmentCode?: string;
  assignment(tenantId: string, deviceId: string): Assignment;
  storeForHost(host: string): StoreConfig;
}

interface TenantEnvironment {
  readonly tenantId: string;
  readonly name: string;
  readonly whatsappPhone: string | undefined;
  readonly publicOrigin: string | undefined;
}

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const subdomainPattern = /^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/;

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

function key(name: string): Uint8Array {
  const value = Buffer.from(required(name), 'base64url');
  if (value.byteLength !== 32) throw new Error(`${name} must decode to 32 bytes`);
  return value;
}

function tenantMap(): ReadonlyMap<string, TenantEnvironment> {
  const parsed: unknown = JSON.parse(required('TALLA_TENANTS_JSON'));
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed))
    throw new Error('Invalid TALLA_TENANTS_JSON');
  const tenants = new Map<string, TenantEnvironment>();
  for (const [subdomain, raw] of Object.entries(parsed)) {
    if (
      !subdomainPattern.test(subdomain) ||
      typeof raw !== 'object' ||
      raw === null ||
      Array.isArray(raw)
    )
      throw new Error('Invalid tenant configuration');
    const value = raw as Record<string, unknown>;
    if (!uuid.test(String(value['tenantId'])) || typeof value['name'] !== 'string')
      throw new Error('Invalid tenant configuration');
    const whatsappPhone = value['whatsappPhone'];
    const publicOrigin = value['publicOrigin'];
    if (
      (whatsappPhone !== undefined &&
        (typeof whatsappPhone !== 'string' ||
          !/^\+[1-9]\d{7,14}$/.test(whatsappPhone))) ||
      (publicOrigin !== undefined &&
        (typeof publicOrigin !== 'string' ||
          !publicOrigin.startsWith('https://') ||
          new URL(publicOrigin).origin !== publicOrigin))
    )
      throw new Error('Invalid tenant handoff configuration');
    tenants.set(subdomain, {
      tenantId: String(value['tenantId']),
      name: value['name'],
      whatsappPhone,
      publicOrigin,
    });
  }
  if (tenants.size === 0) throw new Error('At least one tenant is required');
  return tenants;
}

function resolveStore(
  host: string,
  parentDomain: string,
  localSubdomain: string,
  tenants: ReadonlyMap<string, TenantEnvironment>,
): StoreConfig {
  let hostname: string;
  try {
    hostname = new URL(`http://${host.trim().toLowerCase()}`).hostname;
  } catch {
    throw new Error('AUTH_FORBIDDEN');
  }
  const subdomain =
    hostname === '127.0.0.1' || hostname === 'localhost'
      ? localSubdomain
      : subdomainFromHost(host, parentDomain);
  const tenant = subdomain ? tenants.get(subdomain) : undefined;
  if (!tenant || !subdomain) throw new Error('AUTH_FORBIDDEN');
  return { ...tenant, subdomain };
}

function createRuntime(): StoreRuntime {
  const database = createDatabase({ connectionString: required('TALLA_DATABASE_URL') });
  const privacy = createPrivacyBox(
    key('TALLA_PRIVACY_ENCRYPTION_KEY'),
    key('TALLA_PHONE_INDEX_KEY'),
  );
  const phoneSecret = key('TALLA_PHONE_TOKEN_KEY');
  const experimentSecret = key('TALLA_EXPERIMENT_KEY');
  const tenants = tenantMap();
  const parentDomain = required('TALLA_PARENT_DOMAIN');
  const localSubdomain = process.env['TALLA_LOCAL_SUBDOMAIN']?.trim() ?? 'demo';
  if (!subdomainPattern.test(localSubdomain)) throw new Error('Invalid local subdomain');

  const provider = process.env['TALLA_SMS_PROVIDER']?.trim();
  let developmentCode: string | undefined;
  let sendCode: (phone: string, code: string) => Promise<void>;
  let createCode: (() => string) | undefined;
  if (provider === 'development' && process.env['NODE_ENV'] !== 'production') {
    developmentCode = process.env['TALLA_DEVELOPMENT_OTP_CODE']?.trim() ?? '123456';
    if (!/^\d{6}$/.test(developmentCode)) throw new Error('Invalid development OTP');
    sendCode = () => Promise.resolve();
    createCode = () => developmentCode as string;
  } else if (provider === 'twilio') {
    sendCode = createTwilioSender({
      accountSid: required('TWILIO_ACCOUNT_SID'),
      apiKeySid: required('TWILIO_API_KEY_SID'),
      apiKeySecret: required('TWILIO_API_KEY_SECRET'),
      messagingServiceSid: required('TWILIO_MESSAGING_SERVICE_SID'),
    });
  } else {
    throw new Error('TALLA_SMS_PROVIDER must be twilio in production');
  }

  const phone = createPhoneVerification({
    database,
    secret: phoneSecret,
    phoneHash: privacy.phoneHash,
    sendCode,
    ...(createCode ? { createCode } : {}),
  });
  const checkout = createCheckout({
    database,
    verifyPhone: (token, buyerPhone, tenantId) =>
      Promise.resolve(
        verifyPhoneToken(phoneSecret, privacy.phoneHash, token, buyerPhone, tenantId),
      ),
    sealBuyer: privacy.seal,
    phoneHash: privacy.phoneHash,
  });
  return {
    database,
    privacy,
    checkout,
    phone,
    ...(developmentCode ? { developmentCode } : {}),
    assignment: (tenantId, deviceId) =>
      assignExperiment(experimentSecret, 'outfit-viewer-v1', tenantId, deviceId),
    storeForHost: (host) => resolveStore(host, parentDomain, localSubdomain, tenants),
  };
}

let runtime: StoreRuntime | undefined;

export function getStoreRuntime(): StoreRuntime {
  runtime ??= createRuntime();
  return runtime;
}
