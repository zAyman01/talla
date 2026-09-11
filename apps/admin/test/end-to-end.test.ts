import { readFile } from 'node:fs/promises';
import { createHash, createHmac, randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { beforeAll, afterAll, expect, it } from 'vitest';
import { tenantTransaction } from '@talla/database';
import { runMigrations } from '@talla/database/migrate';
import type { Database, Sql } from '@talla/database';
import { createLogger } from '@talla/observability';
import { createOwnerAuth } from '@talla/tenancy';
import { sanitizeInSandbox } from '@talla/ingest';
import type { PhotoSlot, RawUpload, SanitizedImage } from '@talla/ingest';
import { createImageWorker } from '@talla/worker-image';
import { createJobRunner, enqueueJob } from '@talla/jobs-worker';
import { createAdminRequests, recordAudit } from '../server/request.ts';

/**
 * The admin path, as one test.
 *
 * A store owner receives a code on their phone, signs in on the admin origin, uploads
 * three photographs of a garment, and the garment appears in their store as processing
 * with a job waiting for it. The understanding stage runs, the owner confirms what it
 * derived, and the garment goes ready.
 *
 * It mirrors `apps/storefront/test/end-to-end.test.ts`: the composed services rather than
 * the server actions, because the actions add form parsing, cookies and `redirect`, and
 * what is worth proving is the part that would still be wrong if the seams were wrong.
 *
 * Two things here are not production code, and both are marked where they appear. The
 * understanding handler is Stage E's, and until it exists a queued job dead-letters with
 * `job.no_handler`; this test supplies one so the queue seam is exercised rather than
 * assumed. And the sandbox needs a Docker daemon, so the sanitizer is the real
 * `sanitizeInSandbox` when the environment can run it and a stub otherwise. Everything
 * between the two, which is the part this test exists for, is the shipped code.
 */

const db = new PGlite();
const database: Database = {
  tenant: (tenantId, work) => tenantTransaction(db, tenantId, work),
  async platform<T>(work: (sql: Sql) => Promise<T>): Promise<T> {
    await db.query('BEGIN');
    try {
      const result = await work(db);
      await db.query('COMMIT');
      return result;
    } catch (error) {
      await db.query('ROLLBACK');
      throw error;
    }
  },
  close: () => db.close(),
};

const indexKey = new Uint8Array(32).fill(9);
const phoneHash = (phone: string): string =>
  createHmac('sha256', indexKey).update(phone).digest('hex');

const OWNER_PHONE = '+201000000077';
const CODE = '424242';
const store = '11111111-1111-4111-8111-111111111111';
const ownerId = '44444444-4444-4444-8444-444444444444';

const logger = createLogger({ sink: () => undefined, policy: 'throw' });
const auth = createOwnerAuth({
  database,
  secret: new Uint8Array(32).fill(7),
  phoneHash,
  createCode: () => CODE,
  sendCode: () => Promise.resolve(),
});
const requests = createAdminRequests({ database, auth, logger });

/**
 * Re-encode a photograph the way the sandbox does.
 *
 * Used only when there is no Docker daemon to run the real thing. It is deliberately not
 * `canonicalize` from the image worker: that function decodes untrusted bytes, and spec
 * 12.2 says it runs in the isolated container and nowhere else. A test that imported it
 * into this process would make the exception look ordinary.
 */
function stubSanitize(bytes: Uint8Array): Promise<SanitizedImage> {
  return Promise.resolve({
    bytes,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    contentType: 'image/webp',
    width: 1795,
    height: 2048,
  });
}

const sandboxed = process.env['TALLA_TEST_IMAGE_SANDBOX'] === '1';
const worker = createImageWorker({
  sanitize: sandboxed ? sanitizeInSandbox : stubSanitize,
  // Capture quality assessment is Stage E. Accepting everything is what the admin action
  // does today, and it is why INGEST_TOO_DARK and its siblings are still listed as not
  // yet reachable in the taxonomy coverage test.
  assess: () => Promise.resolve({ accepted: true }),
});

async function photographs(): Promise<RawUpload['photos']> {
  const files: ReadonlyArray<readonly [PhotoSlot, string]> = [
    ['front', 'tee-front.jpg'],
    ['back', 'tee-back.jpg'],
    ['three_quarter', 'jeans.jpg'],
  ];
  return Promise.all(
    files.map(async ([slot, name]) => ({
      slot,
      declaredContentType: 'image/jpeg',
      bytes: new Uint8Array(
        await readFile(new URL(`../../../fixtures/reference/${name}`, import.meta.url)),
      ),
    })),
  );
}

beforeAll(async () => {
  await runMigrations(db);
  await db.query(
    "INSERT INTO tenants (id, subdomain, name_ar, name_en) VALUES ($1,'nasij','النسيج','Nasij')",
    [store],
  );
  await db.query('INSERT INTO owners (id, phone_hash) VALUES ($1,$2)', [
    ownerId,
    phoneHash(OWNER_PHONE),
  ]);
  await db.query(
    "INSERT INTO owner_tenants (owner_id, tenant_id, role) VALUES ($1,$2,'owner')",
    [ownerId, store],
  );
  // Everything from here runs as the application role, so the grants and the policies are
  // part of what this test exercises rather than something it runs around.
  await db.exec('SET ROLE talla_app');
}, 60_000);

afterAll(async () => {
  await db.close();
});

it('takes an owner from a phone number to a published garment', async () => {
  // 1. The owner signs in. A code goes to the phone, and the session is a token.
  const started = await auth.startLogin(OWNER_PHONE, '203.0.113.7');
  if (!started.ok) throw new Error(`startLogin failed: ${started.error}`);
  const signedIn = await auth.completeLogin(started.value.challengeId, OWNER_PHONE, CODE);
  if (!signedIn.ok) throw new Error(`completeLogin failed: ${signedIn.error}`);
  const token = signedIn.value.token;

  // 2. Three photographs, through the worker. Nothing in this process parses them.
  const traceId = randomUUID();
  const validated = await worker.process({
    tenantId: store,
    traceId,
    photos: await photographs(),
  });
  if (!validated.ok) throw new Error(`upload rejected: ${validated.error}`);
  expect(validated.value.photos).toHaveLength(3);
  for (const photo of validated.value.photos) {
    // Whatever went in, what comes out is Talla-written WebP with a digest to store.
    expect(photo.contentType).toBe('image/webp');
    expect(photo.sha256).toMatch(/^[a-f0-9]{64}$/);
  }

  // 3. The garment, the job, and the audit line land in one transaction, under a tenant
  //    taken from the owner's membership and never from a parameter (ADR-0022).
  const garmentId = randomUUID();
  const uploaded = await requests.withOwnerTenant(
    token,
    store,
    traceId,
    async (sql, context) => {
      await sql.query(
        `INSERT INTO garments (tenant_id, id, name_ar, name_en, price, status)
         VALUES ($1, $2, $3, $3, $4, 'processing')`,
        [context.tenantId, garmentId, 'تي شيرت قطن', 65000],
      );
      await enqueueJob(sql, {
        tenantId: context.tenantId,
        jobId: randomUUID(),
        garmentId,
        stage: 'understanding',
        traceId,
        availableAt: new Date(),
      });
      await recordAudit(sql, context, 'garment.uploaded', garmentId, {
        photos: validated.value.photos.length,
      });
      return context.ownerId;
    },
  );
  expect(uploaded).toEqual({ ok: true, value: ownerId });

  // 4. The understanding stage. The handler is Stage E's and stands in here; the runner,
  //    the lease and the completion are the shipped ones.
  const runner = createJobRunner({
    database,
    logger,
    handlers: {
      understanding: (job, sql) =>
        sql
          .query("UPDATE garments SET status = 'confirmation' WHERE id = $1", [
            job.garmentId,
          ])
          .then(() => undefined),
    },
  });
  expect(await runner.runOnce()).toMatchObject({ claimed: 1, completed: 1 });

  // 5. The owner confirms what was derived, which is the only transition that publishes.
  const confirmed = await requests.withOwnerTenant(
    token,
    store,
    traceId,
    async (sql, context) => {
      const { rows } = await sql.query<{ status: string }>(
        "UPDATE garments SET status = 'ready' WHERE id = $1 AND status = 'confirmation' RETURNING status",
        [garmentId],
      );
      if (rows.length === 0) return false;
      await recordAudit(sql, context, 'garment.confirmed', garmentId);
      return true;
    },
  );
  expect(confirmed).toEqual({ ok: true, value: true });

  // 6. The garment is live, and both steps are on the record with the owner who took them.
  await tenantTransaction(db, store, async (sql) => {
    const { rows } = await sql.query<{ status: string }>(
      'SELECT status FROM garments WHERE id = $1',
      [garmentId],
    );
    expect(rows[0]?.status).toBe('ready');

    const { rows: audit } = await sql.query<{ action: string; actor_id: string }>(
      'SELECT action, actor_id FROM audit_log ORDER BY id',
    );
    expect(audit.map((row) => row.action)).toEqual([
      'garment.uploaded',
      'garment.confirmed',
    ]);
    expect(audit.every((row) => row.actor_id === ownerId)).toBe(true);
  });
  // Three photographs mean three container starts when the sandbox is real, which does
  // not fit in the default five seconds on a machine running the rest of the suite
  // beside it. The sandbox's own tests allow the same.
}, 30_000);

it('refuses an upload from a session that has been signed out', async () => {
  // The session is the only thing carrying the owner, so ending it has to end the
  // ability to write, not merely the ability to see a screen.
  const started = await auth.startLogin(OWNER_PHONE, '203.0.113.7');
  if (!started.ok) throw new Error(`startLogin failed: ${started.error}`);
  const signedIn = await auth.completeLogin(started.value.challengeId, OWNER_PHONE, CODE);
  if (!signedIn.ok) throw new Error(`completeLogin failed: ${signedIn.error}`);
  await auth.endSession(signedIn.value.token);

  expect(
    await requests.withOwnerTenant(signedIn.value.token, store, 'trace-out', () =>
      Promise.resolve('wrote'),
    ),
  ).toEqual({ ok: false, error: 'AUTH_SESSION_EXPIRED' });
});
