import {
  createHash,
  createHmac,
  randomInt,
  randomUUID,
  timingSafeEqual,
} from 'node:crypto';
import type { ErrorCode } from '@talla/errors';
import type { Database, Sql } from '@talla/database';
import { consumeRateLimit } from '@talla/database';
import type { Result, TenantId } from '@talla/shared';

/**
 * Store owner authentication: phone OTP, no password (ADR-0007).
 *
 * Owner identity is platform level. An owner types a phone number before any tenant is
 * known, so every table here is read through `database.platform` rather than inside a
 * tenant transaction, and `owner_tenants` is the join that decides which tenant an owner
 * is allowed to become (ADR-0022).
 *
 * Two properties this file exists to hold:
 *
 * **A caller cannot learn whether a number is registered.** An unknown number gets a
 * challenge row, a generated code, and the same response as a known one. Nothing is sent,
 * and the later verification fails the same way a wrong code does.
 *
 * **A leaked database backup does not hand over live sessions.** Only `sha256` of the
 * cookie token is stored, so the row is not the credential.
 *
 * Failures are returned as a `Result` carrying a taxonomy code, not thrown as a string
 * (spec 16.5). The buyer path in `modules/commerce` still throws; Task 6 of the spine
 * plan converts it, and new code does not add to that debt.
 */

export type AuthFailure = Extract<ErrorCode, `AUTH_${string}`>;

export interface OwnerSession {
  readonly sessionId: string;
  readonly ownerId: string;
  readonly expiresAt: string;
}

export interface OwnerMembership {
  readonly tenantId: TenantId;
  readonly role: 'owner' | 'staff';
}

export interface StartedLogin {
  readonly challengeId: string;
  readonly expiresAt: string;
}

export interface CompletedLogin {
  /** Goes in a host-only, HttpOnly, Secure, SameSite=Lax cookie (spec 12.4). */
  readonly token: string;
  readonly session: OwnerSession;
}

export interface OwnerAuthDependencies {
  readonly database: Database;
  readonly secret: Uint8Array;
  readonly phoneHash: (phone: string) => string;
  readonly sendCode: (phone: string, code: string) => Promise<void>;
  readonly now?: () => Date;
  readonly createCode?: () => string;
  readonly createToken?: () => string;
}

export interface OwnerAuth {
  startLogin(
    phone: string,
    ipAddress: string,
  ): Promise<Result<StartedLogin, AuthFailure>>;
  completeLogin(
    challengeId: string,
    phone: string,
    code: string,
    previousToken?: string,
  ): Promise<Result<CompletedLogin, AuthFailure>>;
  resolveSession(token: string): Promise<Result<OwnerSession, AuthFailure>>;
  membershipsFor(ownerId: string): Promise<readonly OwnerMembership[]>;
  /** The check `withOwnerTenant` runs before any admin request touches tenant data. */
  authorizeTenant(
    ownerId: string,
    tenantId: string,
  ): Promise<Result<OwnerMembership, AuthFailure>>;
  endSession(token: string): Promise<void>;
}

const PHONE = /^\+[1-9]\d{7,14}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CODE = /^\d{6}$/;

const CHALLENGE_LIFETIME_MS = 5 * 60 * 1000;
const MAX_ATTEMPTS = 5;

/** Absolute cap. An admin session does not survive the working day it was opened in. */
const SESSION_LIFETIME_MS = 12 * 60 * 60 * 1000;
/** Idle timeout on admin (spec 12.4). A shop phone left on a counter is the threat. */
const SESSION_IDLE_MS = 30 * 60 * 1000;

const OTP_PER_PHONE = { limit: 5, windowMs: 10 * 60 * 1000 } as const;
const OTP_PER_IP = { limit: 10, windowMs: 10 * 60 * 1000 } as const;
const VERIFY_PER_IP = { limit: 20, windowMs: 10 * 60 * 1000 } as const;

function digest(secret: Uint8Array, parts: readonly string[]): string {
  return createHmac('sha256', secret).update(JSON.stringify(parts)).digest('hex');
}

function equalHex(first: string, second: string): boolean {
  if (!/^[a-f0-9]{64}$/.test(first) || !/^[a-f0-9]{64}$/.test(second)) return false;
  return timingSafeEqual(Buffer.from(first, 'hex'), Buffer.from(second, 'hex'));
}

/** The stored form of a session token. The token itself is never written down. */
function tokenHash(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

interface ChallengeRow extends Record<string, unknown> {
  readonly owner_id: string | null;
  readonly phone_hash: string;
  readonly code_hash: string;
  readonly attempts: number;
  readonly expires_at: Date | string;
  readonly consumed_at: Date | string | null;
}

interface SessionRow extends Record<string, unknown> {
  readonly id: string;
  readonly owner_id: string;
  readonly expires_at: Date | string;
  readonly last_seen_at: Date | string;
}

const failure = (error: AuthFailure): Result<never, AuthFailure> => ({
  ok: false,
  error,
});

export function createOwnerAuth(dependencies: OwnerAuthDependencies): OwnerAuth {
  if (dependencies.secret.byteLength < 32) {
    throw new Error('Owner authentication secret must be at least 32 bytes');
  }
  const now = dependencies.now ?? ((): Date => new Date());
  const createCode =
    dependencies.createCode ??
    ((): string => String(randomInt(0, 1_000_000)).padStart(6, '0'));
  const createToken =
    dependencies.createToken ??
    ((): string => Buffer.from(randomUUID() + randomUUID()).toString('base64url'));

  async function issueSession(
    sql: Sql,
    ownerId: string,
    issuedAt: Date,
    rotatedFrom: string | null,
  ): Promise<CompletedLogin> {
    const token = createToken();
    const sessionId = randomUUID();
    const expiresAt = new Date(issuedAt.getTime() + SESSION_LIFETIME_MS);
    await sql.query(
      `INSERT INTO sessions (id, owner_id, token_hash, created_at, last_seen_at, expires_at, rotated_from)
       VALUES ($1, $2, $3, $4, $4, $5, $6)`,
      [sessionId, ownerId, tokenHash(token), issuedAt, expiresAt, rotatedFrom],
    );
    return {
      token,
      session: { sessionId, ownerId, expiresAt: expiresAt.toISOString() },
    };
  }

  return {
    async startLogin(phone, ipAddress) {
      if (!PHONE.test(phone) || ipAddress.trim() === '') {
        return failure('AUTH_FORBIDDEN');
      }
      const createdAt = now();
      const phoneHash = dependencies.phoneHash(phone);
      const ipHash = digest(dependencies.secret, ['otp-ip', ipAddress]);
      const challengeId = randomUUID();
      const code = createCode();
      if (!CODE.test(code)) throw new Error('Invalid OTP generator');

      const prepared = await dependencies.database.platform(async (sql) => {
        const byPhone = await consumeRateLimit(
          sql,
          { bucket: `owner-otp:phone:${phoneHash}`, ...OTP_PER_PHONE },
          createdAt,
        );
        const byIp = await consumeRateLimit(
          sql,
          { bucket: `owner-otp:ip:${ipHash}`, ...OTP_PER_IP },
          createdAt,
        );
        if (!byPhone.allowed || !byIp.allowed) return undefined;

        // An unknown number still gets a row. Skipping the insert, or returning early,
        // is how a login form becomes a way to enumerate which shops use Talla.
        const { rows } = await sql.query<{ id: string }>(
          'SELECT id FROM owners WHERE phone_hash = $1 AND disabled_at IS NULL',
          [phoneHash],
        );
        const ownerId = rows[0]?.id ?? null;
        await sql.query(
          `INSERT INTO owner_challenges
             (id, owner_id, phone_hash, ip_hash, code_hash, expires_at, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            challengeId,
            ownerId,
            phoneHash,
            ipHash,
            digest(dependencies.secret, [challengeId, phoneHash, code]),
            new Date(createdAt.getTime() + CHALLENGE_LIFETIME_MS),
            createdAt,
          ],
        );
        return { ownerId };
      });

      if (prepared === undefined) return failure('AUTH_OTP_RATE_LIMITED');

      if (prepared.ownerId !== null) {
        try {
          await dependencies.sendCode(phone, code);
        } catch {
          await dependencies.database.platform(async (sql) => {
            await sql.query(
              'UPDATE owner_challenges SET consumed_at = $1 WHERE id = $2 AND consumed_at IS NULL',
              [now(), challengeId],
            );
          });
          return failure('AUTH_OTP_DELIVERY_FAILED');
        }
      }

      return {
        ok: true,
        value: {
          challengeId,
          expiresAt: new Date(createdAt.getTime() + CHALLENGE_LIFETIME_MS).toISOString(),
        },
      };
    },

    async completeLogin(challengeId, phone, code, previousToken) {
      if (!UUID.test(challengeId) || !PHONE.test(phone) || !CODE.test(code)) {
        return failure('AUTH_OTP_INVALID');
      }
      const verifiedAt = now();
      const phoneHash = dependencies.phoneHash(phone);

      return dependencies.database.platform(
        async (sql): Promise<Result<CompletedLogin, AuthFailure>> => {
          const attemptBudget = await consumeRateLimit(
            sql,
            { bucket: `owner-verify:phone:${phoneHash}`, ...VERIFY_PER_IP },
            verifiedAt,
          );
          if (!attemptBudget.allowed) return failure('AUTH_OTP_RATE_LIMITED');

          const { rows } = await sql.query<ChallengeRow>(
            `SELECT owner_id, phone_hash, code_hash, attempts, expires_at, consumed_at
             FROM owner_challenges WHERE id = $1 FOR UPDATE`,
            [challengeId],
          );
          const challenge = rows[0];
          if (
            challenge === undefined ||
            challenge.consumed_at !== null ||
            challenge.attempts >= MAX_ATTEMPTS
          ) {
            return failure('AUTH_OTP_INVALID');
          }

          if (new Date(challenge.expires_at).getTime() < verifiedAt.getTime()) {
            await sql.query(
              'UPDATE owner_challenges SET consumed_at = $1 WHERE id = $2',
              [verifiedAt, challengeId],
            );
            return failure('AUTH_OTP_INVALID');
          }

          const expected = digest(dependencies.secret, [challengeId, phoneHash, code]);
          if (
            challenge.phone_hash !== phoneHash ||
            !equalHex(challenge.code_hash, expected)
          ) {
            await sql.query(
              'UPDATE owner_challenges SET attempts = attempts + 1 WHERE id = $1',
              [challengeId],
            );
            return failure('AUTH_OTP_INVALID');
          }

          await sql.query(
            'UPDATE owner_challenges SET attempts = attempts + 1, consumed_at = $1 WHERE id = $2',
            [verifiedAt, challengeId],
          );

          // The code was right. If the number belongs to nobody, this is where an
          // unregistered caller lands, and it is indistinguishable from a wrong code.
          if (challenge.owner_id === null) return failure('AUTH_OTP_INVALID');

          // Session fixation: a token the caller already held is revoked and recorded as
          // the predecessor, so a session handed to a victim before login cannot survive
          // it (spec 12.4). Revoked, not deleted: the successor points at it, and a
          // deleted predecessor is a chain that cannot answer a dispute.
          let rotatedFrom: string | null = null;
          if (previousToken !== undefined && previousToken.trim() !== '') {
            const { rows: previous } = await sql.query<{ id: string }>(
              'UPDATE sessions SET revoked_at = $1 WHERE token_hash = $2 AND revoked_at IS NULL RETURNING id',
              [verifiedAt, tokenHash(previousToken)],
            );
            rotatedFrom = previous[0]?.id ?? null;
          }

          return {
            ok: true,
            value: await issueSession(sql, challenge.owner_id, verifiedAt, rotatedFrom),
          };
        },
      );
    },

    async resolveSession(token) {
      if (token.trim() === '') return failure('AUTH_SESSION_EXPIRED');
      const at = now();

      return dependencies.database.platform(
        async (sql): Promise<Result<OwnerSession, AuthFailure>> => {
          const { rows } = await sql.query<SessionRow>(
            `SELECT s.id, s.owner_id, s.expires_at, s.last_seen_at
             FROM sessions s
             JOIN owners o ON o.id = s.owner_id
             WHERE s.token_hash = $1 AND s.revoked_at IS NULL AND o.disabled_at IS NULL
             FOR UPDATE OF s`,
            [tokenHash(token)],
          );
          const session = rows[0];
          if (session === undefined) return failure('AUTH_SESSION_EXPIRED');

          const expired =
            new Date(session.expires_at).getTime() <= at.getTime() ||
            new Date(session.last_seen_at).getTime() + SESSION_IDLE_MS <= at.getTime();
          if (expired) {
            await sql.query('UPDATE sessions SET revoked_at = $1 WHERE id = $2', [
              at,
              session.id,
            ]);
            return failure('AUTH_SESSION_EXPIRED');
          }

          await sql.query('UPDATE sessions SET last_seen_at = $1 WHERE id = $2', [
            at,
            session.id,
          ]);
          return {
            ok: true,
            value: {
              sessionId: session.id,
              ownerId: session.owner_id,
              expiresAt: new Date(session.expires_at).toISOString(),
            },
          };
        },
      );
    },

    membershipsFor(ownerId) {
      if (!UUID.test(ownerId)) return Promise.resolve([]);
      return dependencies.database.platform(async (sql) => {
        const { rows } = await sql.query<{ tenant_id: string; role: string }>(
          `SELECT m.tenant_id, m.role FROM owner_tenants m
           JOIN tenants t ON t.id = m.tenant_id
           WHERE m.owner_id = $1 AND t.active
           ORDER BY m.created_at`,
          [ownerId],
        );
        return rows.map((row) => ({
          tenantId: row.tenant_id,
          role: row.role === 'staff' ? ('staff' as const) : ('owner' as const),
        }));
      });
    },

    async authorizeTenant(ownerId, tenantId) {
      if (!UUID.test(ownerId) || !UUID.test(tenantId)) return failure('AUTH_FORBIDDEN');
      const memberships = await this.membershipsFor(ownerId);
      const match = memberships.find((membership) => membership.tenantId === tenantId);
      // A tenant the owner does not belong to and a tenant that does not exist fail
      // identically. Distinguishing them tells a caller which stores are on Talla.
      return match === undefined ? failure('AUTH_FORBIDDEN') : { ok: true, value: match };
    },

    endSession(token) {
      if (token.trim() === '') return Promise.resolve();
      const at = now();
      return dependencies.database.platform(async (sql) => {
        await sql.query(
          'UPDATE sessions SET revoked_at = $1 WHERE token_hash = $2 AND revoked_at IS NULL',
          [at, tokenHash(token)],
        );
      });
    },
  };
}
