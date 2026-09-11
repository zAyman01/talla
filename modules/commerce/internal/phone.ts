import { createHmac, randomInt, randomUUID, timingSafeEqual } from 'node:crypto';
import type { Database } from '@talla/database';
import { codedError } from '@talla/errors';

export interface PhoneVerificationDependencies {
  readonly database: Database;
  readonly secret: Uint8Array;
  readonly phoneHash: (phone: string) => string;
  readonly sendCode: (phone: string, code: string) => Promise<void>;
  readonly now?: () => Date;
  readonly createCode?: () => string;
}

export interface PhoneVerification {
  start(
    tenantId: string,
    phone: string,
    ipAddress: string,
  ): Promise<{ readonly challengeId: string; readonly expiresAt: string }>;
  verify(
    tenantId: string,
    challengeId: string,
    phone: string,
    code: string,
  ): Promise<{ readonly token: string }>;
}

const phonePattern = /^\+[1-9]\d{7,14}$/;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const challengeLifetimeMs = 5 * 60 * 1000;
const tokenLifetimeMs = 10 * 60 * 1000;
const rateWindowMs = 10 * 60 * 1000;

function digest(secret: Uint8Array, parts: readonly string[]): string {
  return createHmac('sha256', secret).update(JSON.stringify(parts)).digest('hex');
}

function equalHex(first: string, second: string): boolean {
  if (!/^[a-f0-9]{64}$/.test(first) || !/^[a-f0-9]{64}$/.test(second)) return false;
  return timingSafeEqual(Buffer.from(first, 'hex'), Buffer.from(second, 'hex'));
}

function signPhoneToken(
  secret: Uint8Array,
  tenantId: string,
  phoneHash: string,
  expiresAt: number,
): string {
  const payload = Buffer.from(
    JSON.stringify({ v: 1, tenantId, phoneHash, expiresAt }),
  ).toString('base64url');
  return `${payload}.${digest(secret, ['phone-token', payload])}`;
}

/**
 * Takes the phone index, not the number. The token was minted against the same hash, so
 * the plaintext adds nothing to the check and would only be one more place it lives.
 */
export function verifyPhoneToken(
  secret: Uint8Array,
  token: string,
  phoneHash: string,
  tenantId: string,
  now = new Date(),
): boolean {
  if (secret.byteLength < 32 || !/^[a-f0-9]{64}$/.test(phoneHash)) return false;
  const [payload, signature, extra] = token.split('.');
  if (
    !payload ||
    !signature ||
    extra ||
    !equalHex(signature, digest(secret, ['phone-token', payload]))
  )
    return false;
  try {
    const parsed: unknown = JSON.parse(
      Buffer.from(payload, 'base64url').toString('utf8'),
    );
    if (typeof parsed !== 'object' || parsed === null) return false;
    const value = parsed as Record<string, unknown>;
    return (
      value['v'] === 1 &&
      value['tenantId'] === tenantId &&
      value['phoneHash'] === phoneHash &&
      typeof value['expiresAt'] === 'number' &&
      Number.isSafeInteger(value['expiresAt']) &&
      value['expiresAt'] >= now.getTime()
    );
  } catch {
    return false;
  }
}

export function createPhoneVerification(
  dependencies: PhoneVerificationDependencies,
): PhoneVerification {
  if (dependencies.secret.byteLength < 32)
    throw new Error('Phone verification secret must be at least 32 bytes');
  const now = dependencies.now ?? (() => new Date());
  const createCode =
    dependencies.createCode ?? (() => String(randomInt(0, 1_000_000)).padStart(6, '0'));

  return {
    async start(tenantId, phone, ipAddress) {
      if (!phonePattern.test(phone) || !ipAddress.trim())
        throw codedError('ORDER_INVALID_INPUT');
      const createdAt = now();
      const expiresAt = new Date(createdAt.getTime() + challengeLifetimeMs);
      const phoneHash = dependencies.phoneHash(phone);
      const ipHash = digest(dependencies.secret, ['otp-ip', ipAddress]);
      const challengeId = randomUUID();
      const code = createCode();
      if (!/^\d{6}$/.test(code)) throw new Error('Invalid OTP generator');
      const codeHash = digest(dependencies.secret, [challengeId, phoneHash, code]);

      await dependencies.database.tenant(tenantId, async (sql) => {
        const result = (
          await sql.query<{ phone_count: number; ip_count: number }>(
            `SELECT
              count(*) FILTER (WHERE phone_hash=$1)::int AS phone_count,
              count(*) FILTER (WHERE ip_hash=$2)::int AS ip_count
            FROM phone_challenges WHERE created_at >= $3`,
            [phoneHash, ipHash, new Date(createdAt.getTime() - rateWindowMs)],
          )
        ).rows[0];
        if ((result?.phone_count ?? 0) >= 5 || (result?.ip_count ?? 0) >= 10)
          throw codedError('AUTH_OTP_RATE_LIMITED');
        await sql.query(
          `INSERT INTO phone_challenges
            (tenant_id,id,phone_hash,ip_hash,code_hash,expires_at,created_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7)`,
          [tenantId, challengeId, phoneHash, ipHash, codeHash, expiresAt, createdAt],
        );
      });

      try {
        await dependencies.sendCode(phone, code);
      } catch {
        await dependencies.database.tenant(tenantId, async (sql) => {
          await sql.query(
            'UPDATE phone_challenges SET consumed_at=$1 WHERE id=$2 AND consumed_at IS NULL',
            [now(), challengeId],
          );
        });
        throw codedError('AUTH_OTP_DELIVERY_FAILED');
      }
      return { challengeId, expiresAt: expiresAt.toISOString() };
    },

    async verify(tenantId, challengeId, phone, code) {
      if (
        !uuidPattern.test(challengeId) ||
        !phonePattern.test(phone) ||
        !/^\d{6}$/.test(code)
      )
        throw codedError('ORDER_OTP_INVALID');
      const verifiedAt = now();
      const phoneHash = dependencies.phoneHash(phone);
      await dependencies.database.tenant(tenantId, async (sql) => {
        const challenge = (
          await sql.query<{
            phone_hash: string;
            code_hash: string;
            attempts: number;
            expires_at: Date | string;
            consumed_at: Date | string | null;
          }>(
            'SELECT phone_hash,code_hash,attempts,expires_at,consumed_at FROM phone_challenges WHERE id=$1 FOR UPDATE',
            [challengeId],
          )
        ).rows[0];
        if (!challenge || challenge.consumed_at || challenge.attempts >= 5)
          throw codedError('ORDER_OTP_INVALID');
        if (new Date(challenge.expires_at).getTime() < verifiedAt.getTime()) {
          await sql.query('UPDATE phone_challenges SET consumed_at=$1 WHERE id=$2', [
            verifiedAt,
            challengeId,
          ]);
          throw codedError('ORDER_OTP_EXPIRED');
        }
        const expected = digest(dependencies.secret, [challengeId, phoneHash, code]);
        if (
          challenge.phone_hash !== phoneHash ||
          !equalHex(challenge.code_hash, expected)
        ) {
          await sql.query('UPDATE phone_challenges SET attempts=attempts+1 WHERE id=$1', [
            challengeId,
          ]);
          throw codedError('ORDER_OTP_INVALID');
        }
        await sql.query(
          'UPDATE phone_challenges SET attempts=attempts+1,consumed_at=$1 WHERE id=$2',
          [verifiedAt, challengeId],
        );
      });
      return {
        token: signPhoneToken(
          dependencies.secret,
          tenantId,
          phoneHash,
          verifiedAt.getTime() + tokenLifetimeMs,
        ),
      };
    },
  };
}
