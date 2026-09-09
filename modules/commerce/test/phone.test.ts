import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createPrivacyBox, tenantTransaction } from '@talla/database';
import type { Database } from '@talla/database';
import { createPhoneVerification, verifyPhoneToken } from '../index.ts';

const tenant = '11111111-1111-4111-8111-111111111111';
const otherTenant = '22222222-2222-4222-8222-222222222222';
const phone = '+201000000000';
const secret = new Uint8Array(32).fill(9);
const privacy = createPrivacyBox(new Uint8Array(32).fill(1), new Uint8Array(32).fill(2));
const db = new PGlite();
const database: Database = {
  tenant: (tenantId, work) => tenantTransaction(db, tenantId, work),
  close: () => db.close(),
};

beforeAll(async () => {
  for (const migration of ['001-initial.sql', '002-phone-verification.sql'])
    await db.exec(
      await readFile(
        new URL(`../../../packages/database/migrations/${migration}`, import.meta.url),
        'utf8',
      ),
    );
  await db.query(
    "INSERT INTO tenants(id,subdomain,name_ar,name_en) VALUES($1,'phone-test','اختبار','Test'),($2,'phone-other','آخر','Other')",
    [tenant, otherTenant],
  );
  await db.exec('SET ROLE talla_app');
}, 30000);

afterAll(async () => {
  await db.close();
});

describe('phone verification', () => {
  it('issues a single-use token bound to the tenant and phone', async () => {
    let clock = new Date('2026-09-09T10:00:00.000Z');
    const sent = vi.fn(() => Promise.resolve());
    const service = createPhoneVerification({
      database,
      secret,
      phoneHash: privacy.phoneHash,
      sendCode: sent,
      now: () => clock,
      createCode: () => '123456',
    });
    const challenge = await service.start(tenant, phone, '192.0.2.1');
    expect(sent).toHaveBeenCalledWith(phone, '123456');
    const verified = await service.verify(tenant, challenge.challengeId, phone, '123456');
    expect(
      verifyPhoneToken(secret, privacy.phoneHash, verified.token, phone, tenant, clock),
    ).toBe(true);
    expect(
      verifyPhoneToken(
        secret,
        privacy.phoneHash,
        verified.token,
        phone,
        otherTenant,
        clock,
      ),
    ).toBe(false);
    await expect(
      service.verify(tenant, challenge.challengeId, phone, '123456'),
    ).rejects.toThrow('ORDER_OTP_INVALID');
    clock = new Date(clock.getTime() + 11 * 60 * 1000);
    expect(
      verifyPhoneToken(secret, privacy.phoneHash, verified.token, phone, tenant, clock),
    ).toBe(false);
  });

  it('expires challenges after five minutes', async () => {
    let clock = new Date('2026-09-10T10:00:00.000Z');
    const service = createPhoneVerification({
      database,
      secret,
      phoneHash: privacy.phoneHash,
      sendCode: () => Promise.resolve(),
      now: () => clock,
      createCode: () => '654321',
    });
    const challenge = await service.start(tenant, '+201000000001', '192.0.2.2');
    clock = new Date(clock.getTime() + 5 * 60 * 1000 + 1);
    await expect(
      service.verify(tenant, challenge.challengeId, '+201000000001', '654321'),
    ).rejects.toThrow('ORDER_OTP_EXPIRED');
  });

  it('rate limits repeated sends by phone without storing the phone', async () => {
    const service = createPhoneVerification({
      database,
      secret,
      phoneHash: privacy.phoneHash,
      sendCode: () => Promise.resolve(),
      now: () => new Date('2026-09-11T10:00:00.000Z'),
      createCode: () => '111111',
    });
    for (let attempt = 0; attempt < 5; attempt += 1)
      await service.start(tenant, '+201000000002', `192.0.2.${String(attempt + 10)}`);
    await expect(service.start(tenant, '+201000000002', '192.0.2.99')).rejects.toThrow(
      'AUTH_OTP_RATE_LIMITED',
    );
    await database.tenant(tenant, async (sql) => {
      const rows = (await sql.query('SELECT phone_hash,ip_hash FROM phone_challenges'))
        .rows;
      expect(JSON.stringify(rows)).not.toContain('+201000000002');
      expect(JSON.stringify(rows)).not.toContain('192.0.2');
    });
  });
});
