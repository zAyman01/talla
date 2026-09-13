import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { createPrivacyBox, tenantTransaction } from '@talla/database';
import type { Database } from '@talla/database';
import { createOwnerAuth } from '../internal/owner-auth.ts';

const tenant = '11111111-1111-4111-8111-111111111111';
const ownerId = '55555555-5555-4555-8555-555555555555';
const phone = '+201000000000';
const db = new PGlite();
const database: Database = {
  tenant: (tenantId, work) => tenantTransaction(db, tenantId, work),
  platform: () => {
    throw new Error('Legacy tenant-owner authentication must stay tenant scoped');
  },
  close: () => db.close(),
};
const privacy = createPrivacyBox(new Uint8Array(32).fill(1), new Uint8Array(32).fill(2));

beforeAll(async () => {
  for (const migration of ['001-initial.sql', '004-owner-sessions.sql'])
    await db.exec(
      await readFile(
        new URL(`../../../packages/database/migrations/${migration}`, import.meta.url),
        'utf8',
      ),
    );
  await db.query(
    "INSERT INTO tenants(id,subdomain,name_ar,name_en) VALUES($1,'owner-test','متجر','Store')",
    [tenant],
  );
  await db.query(
    "INSERT INTO store_owners(tenant_id,id,phone_hash,display_name) VALUES($1,$2,$3,'مدير')",
    [tenant, ownerId, privacy.phoneHash(phone)],
  );
  await db.exec('SET ROLE talla_app');
}, 30_000);

afterAll(async () => {
  await db.close();
});

it('creates, validates and revokes an opaque owner session', async () => {
  const auth = createOwnerAuth({
    database,
    phoneHash: privacy.phoneHash,
    secret: new Uint8Array(32).fill(3),
    now: () => new Date('2026-09-09T10:00:00.000Z'),
  });
  await expect(auth.isOwner(tenant, phone)).resolves.toBe(true);
  await expect(auth.isOwner(tenant, '+201999999999')).resolves.toBe(false);
  const session = await auth.createSession(tenant, phone);
  await expect(auth.authenticate(tenant, session.value)).resolves.toEqual({
    ownerId,
    displayName: 'مدير',
  });
  await expect(auth.authenticate(tenant, `${session.value}x`)).resolves.toBeUndefined();
  await auth.revoke(tenant, session.value);
  await expect(auth.authenticate(tenant, session.value)).resolves.toBeUndefined();
});
