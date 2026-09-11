import type { Sql } from './sql.ts';

/**
 * Fixed-window counters, in PostgreSQL.
 *
 * Spec section 6 puts rate-limit counters in Redis. ADR-0019 keeps them here until there
 * is a workload that genuinely wants Redis, on the grounds that a second stateful
 * dependency in local development, CI and production buys nothing at pilot scale.
 *
 * A fixed window, not a sliding one. A sliding window is more accurate at the boundary
 * and needs either a sorted set or a row per event; a fixed window needs one row per
 * bucket and one statement. The cost is that a caller can spend a full allowance at the
 * end of one window and another at the start of the next. For OTP requests that means a
 * burst of at most twice the limit, which is the difference between a nuisance and a
 * nuisance, and nothing about it weakens the code itself: codes still expire in five
 * minutes and attempts are still capped per challenge.
 */

export interface RateLimitDecision {
  readonly allowed: boolean;
  /** Requests already counted in this window, including the one just attempted. */
  readonly used: number;
  readonly retryAfterMs: number;
}

export interface RateLimitRule {
  /** Identifies what is being limited: `otp:phone:<hash>`, `order:ip:<hash>`. */
  readonly bucket: string;
  readonly limit: number;
  readonly windowMs: number;
}

function windowStart(now: Date, windowMs: number): Date {
  return new Date(Math.floor(now.getTime() / windowMs) * windowMs);
}

/**
 * Count one attempt against a rule and say whether it is allowed.
 *
 * The insert is atomic, so two concurrent requests cannot both read a count of four and
 * both decide they are the fifth. `ON CONFLICT DO UPDATE` with a `RETURNING` is one
 * statement and one round trip, and the returned count is the authoritative one.
 *
 * The attempt is counted whether or not it is allowed. A caller that is over the limit
 * and keeps trying does not get its window reset by being refused.
 */
export async function consumeRateLimit(
  sql: Sql,
  rule: RateLimitRule,
  now: Date = new Date(),
): Promise<RateLimitDecision> {
  if (rule.limit < 1 || rule.windowMs < 1 || rule.bucket.trim() === '') {
    throw new Error('Invalid rate limit rule');
  }

  const start = windowStart(now, rule.windowMs);
  const { rows } = await sql.query<{ count: number }>(
    `INSERT INTO rate_limits (bucket, window_start, count)
     VALUES ($1, $2, 1)
     ON CONFLICT (bucket, window_start)
     DO UPDATE SET count = rate_limits.count + 1
     RETURNING count`,
    [rule.bucket, start],
  );

  const used = rows[0]?.count ?? 0;
  return {
    allowed: used <= rule.limit,
    used,
    retryAfterMs: start.getTime() + rule.windowMs - now.getTime(),
  };
}

/**
 * Drop counters for windows that have closed. Nothing reads them, and without this the
 * table grows forever. Called by the retention job in Stage O; until then a pilot's
 * volume makes it a non-issue, which is a reason to defer the scheduler, not the sweep.
 */
export async function sweepRateLimits(sql: Sql, before: Date): Promise<number> {
  const { rows } = await sql.query<{ removed: number }>(
    'WITH gone AS (DELETE FROM rate_limits WHERE window_start < $1 RETURNING 1) SELECT count(*)::int AS removed FROM gone',
    [before],
  );
  return rows[0]?.removed ?? 0;
}
