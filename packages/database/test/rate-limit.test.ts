import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { consumeRateLimit, sweepRateLimits } from '../src/index.ts';
import { runMigrations } from '../src/migrate.ts';

const db = new PGlite();
beforeAll(async () => {
  await runMigrations(db);
}, 60_000);
beforeEach(async () => {
  await db.exec('DELETE FROM rate_limits');
});
afterAll(async () => {
  await db.close();
});

const RULE = { bucket: 'otp:phone:abc', limit: 3, windowMs: 60_000 } as const;
const at = (ms: number): Date => new Date(ms);

describe('consumeRateLimit', () => {
  it('allows up to the limit and refuses after it', async () => {
    const decisions = [];
    for (let i = 0; i < 5; i += 1) {
      decisions.push(await consumeRateLimit(db, RULE, at(1_000 + i)));
    }

    expect(decisions.map((d) => d.allowed)).toEqual([true, true, true, false, false]);
    expect(decisions.map((d) => d.used)).toEqual([1, 2, 3, 4, 5]);
  });

  it('keeps counting attempts that were refused', async () => {
    for (let i = 0; i < 4; i += 1) await consumeRateLimit(db, RULE, at(1_000));

    // A caller over the limit must not reset its own window by continuing to try.
    const next = await consumeRateLimit(db, RULE, at(1_000));
    expect(next.used).toBe(5);
    expect(next.allowed).toBe(false);
  });

  it('keeps separate buckets separate', async () => {
    for (let i = 0; i < 3; i += 1) await consumeRateLimit(db, RULE, at(1_000));

    const other = await consumeRateLimit(
      db,
      { ...RULE, bucket: 'otp:phone:different' },
      at(1_000),
    );
    expect(other.allowed).toBe(true);
    expect(other.used).toBe(1);
  });

  it('starts a fresh allowance in the next window', async () => {
    for (let i = 0; i < 4; i += 1) await consumeRateLimit(db, RULE, at(30_000));
    expect((await consumeRateLimit(db, RULE, at(30_000))).allowed).toBe(false);

    // 90_000 falls in the second 60s window.
    const nextWindow = await consumeRateLimit(db, RULE, at(90_000));
    expect(nextWindow.allowed).toBe(true);
    expect(nextWindow.used).toBe(1);
  });

  it('reports how long until the window turns over', async () => {
    const decision = await consumeRateLimit(db, RULE, at(75_000));
    // Window started at 60_000 and runs to 120_000.
    expect(decision.retryAfterMs).toBe(45_000);
  });

  it('counts concurrent attempts exactly once each', async () => {
    // Two requests must not both read a count of two and both decide they are the third.
    const results = await Promise.all(
      Array.from({ length: 10 }, () => consumeRateLimit(db, RULE, at(1_000))),
    );

    expect([...results.map((r) => r.used)].sort((a, b) => a - b)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
    ]);
    expect(results.filter((r) => r.allowed)).toHaveLength(3);
  });

  it('refuses a rule that would limit nothing', async () => {
    await expect(consumeRateLimit(db, { ...RULE, limit: 0 })).rejects.toThrow(
      /Invalid rate limit rule/,
    );
    await expect(consumeRateLimit(db, { ...RULE, bucket: '  ' })).rejects.toThrow(
      /Invalid rate limit rule/,
    );
  });
});

describe('sweepRateLimits', () => {
  it('removes closed windows and leaves the current one', async () => {
    await consumeRateLimit(db, RULE, at(30_000));
    await consumeRateLimit(db, RULE, at(90_000));

    expect(await sweepRateLimits(db, at(60_000))).toBe(1);
    const { rows } = await db.query<{ count: number }>(
      'SELECT count(*)::int AS count FROM rate_limits',
    );
    expect(rows[0]?.count).toBe(1);
  });
});
