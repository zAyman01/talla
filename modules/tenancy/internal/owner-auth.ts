import { createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import type { Database } from '@talla/database';

export interface OwnerSession {
  readonly ownerId: string;
  readonly displayName: string;
}

export interface OwnerAuth {
  isOwner(tenantId: string, phone: string): Promise<boolean>;
  createSession(
    tenantId: string,
    phone: string,
  ): Promise<{ readonly value: string; readonly expiresAt: string }>;
  authenticate(tenantId: string, value: string): Promise<OwnerSession | undefined>;
  revoke(tenantId: string, value: string): Promise<void>;
}

interface Dependencies {
  readonly database: Database;
  readonly phoneHash: (phone: string) => string;
  readonly secret: Uint8Array;
  readonly now?: () => Date;
}

const phonePattern = /^\+[1-9]\d{7,14}$/;
const sessionPattern = /^([0-9a-f-]{36})\.([A-Za-z0-9_-]{43})$/;
const lifetimeMs = 8 * 60 * 60 * 1000;

function hash(secret: Uint8Array, value: string): string {
  return createHmac('sha256', secret).update(value).digest('hex');
}

function safeEqual(first: string, second: string): boolean {
  if (!/^[a-f0-9]{64}$/.test(first) || !/^[a-f0-9]{64}$/.test(second)) return false;
  return timingSafeEqual(Buffer.from(first, 'hex'), Buffer.from(second, 'hex'));
}

export function createOwnerAuth(dependencies: Dependencies): OwnerAuth {
  if (dependencies.secret.byteLength < 32)
    throw new Error('Owner session secret must be at least 32 bytes');
  const now = dependencies.now ?? (() => new Date());
  async function owner(tenantId: string, phone: string): Promise<OwnerSession | undefined> {
    if (!phonePattern.test(phone)) return undefined;
    return dependencies.database.tenant(tenantId, async (sql) => {
      const row = (
        await sql.query<{ id: string; display_name: string }>(
          'SELECT id,display_name FROM store_owners WHERE phone_hash=$1 AND active=true',
          [dependencies.phoneHash(phone)],
        )
      ).rows[0];
      return row ? { ownerId: row.id, displayName: row.display_name } : undefined;
    });
  }
  return {
    isOwner: async (tenantId, phone) => Boolean(await owner(tenantId, phone)),
    async createSession(tenantId, phone) {
      const activeOwner = await owner(tenantId, phone);
      if (!activeOwner) throw new Error('AUTH_OTP_INVALID');
      const id = randomUUID();
      const token = randomBytes(32).toString('base64url');
      const value = `${id}.${token}`;
      const createdAt = now();
      const expiresAt = new Date(createdAt.getTime() + lifetimeMs);
      await dependencies.database.tenant(tenantId, async (sql) => {
        await sql.query(
          `INSERT INTO owner_sessions
            (tenant_id,id,owner_id,token_hash,expires_at,last_seen_at,created_at)
           VALUES($1,$2,$3,$4,$5,$6,$6)`,
          [tenantId, id, activeOwner.ownerId, hash(dependencies.secret, value), expiresAt, createdAt],
        );
      });
      return { value, expiresAt: expiresAt.toISOString() };
    },
    async authenticate(tenantId, value) {
      const match = sessionPattern.exec(value);
      if (!match) return undefined;
      const sessionId = match[1];
      if (!sessionId) return undefined;
      return dependencies.database.tenant(tenantId, async (sql) => {
        const row = (
          await sql.query<{
            token_hash: string;
            owner_id: string;
            display_name: string;
          }>(
            `SELECT s.token_hash,s.owner_id,o.display_name
             FROM owner_sessions s JOIN store_owners o ON o.id=s.owner_id AND o.tenant_id=s.tenant_id
             WHERE s.id=$1 AND s.expires_at>$2 AND o.active=true FOR UPDATE OF s`,
            [sessionId, now()],
          )
        ).rows[0];
        if (!row || !safeEqual(row.token_hash, hash(dependencies.secret, value)))
          return undefined;
        await sql.query('UPDATE owner_sessions SET last_seen_at=$1 WHERE id=$2', [
          now(),
          sessionId,
        ]);
        return { ownerId: row.owner_id, displayName: row.display_name };
      });
    },
    async revoke(tenantId, value) {
      const match = sessionPattern.exec(value);
      const sessionId = match?.[1];
      if (!sessionId) return;
      await dependencies.database.tenant(tenantId, async (sql) => {
        const row = (
          await sql.query<{ token_hash: string }>(
            'SELECT token_hash FROM owner_sessions WHERE id=$1',
            [sessionId],
          )
        ).rows[0];
        if (row && safeEqual(row.token_hash, hash(dependencies.secret, value)))
          await sql.query('DELETE FROM owner_sessions WHERE id=$1', [sessionId]);
      });
    },
  };
}
