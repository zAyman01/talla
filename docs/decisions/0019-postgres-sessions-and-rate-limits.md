# 0019. Sessions and rate-limit counters live in PostgreSQL, not Redis

**Status:** Accepted
**Date:** 2026-09-11

## Context

Spec section 6 lists four data stores, and gives Redis three jobs: rate-limit counters,
the session store, and the styling-engine result cache. It also constrains Redis with one
line that turns out to decide this record: **nothing in Redis may be the sole copy of
anything.**

Stage S of the production roadmap needs two of those three now. Owner authentication needs
somewhere to keep sessions, and OTP request, OTP verify and order submission all need rate
limits. The styling cache is not needed until there is a catalog large enough for ranking
to cost something.

So the question is narrow: does the first thing that needs a counter justify operating a
second stateful service in local development, CI, and production?

## Decision

**Sessions and rate-limit counters go in PostgreSQL**, as the `sessions` and `rate_limits`
tables in migration `003-owner-identity.sql`. Rate limiting is a fixed window: one row per
bucket per window, incremented by a single `INSERT ... ON CONFLICT DO UPDATE ... RETURNING`.

Redis is not added to the stack in Stage S.

**The trigger that ends this deferral**, so it is a decision rather than a drift: the
styling-engine result cache, which is the workload Redis is actually good at and which
PostgreSQL is a poor substitute for. Rate-limit write volume becoming visible in database
load is the second trigger. Either one is a superseding record, not a quiet migration.

## Consequences

Local development and CI need one service instead of two, and the existing PostgreSQL
service in the CI workflow already provides it. A developer with a clone and a database
has a complete system.

The spec's "sole copy" constraint stops being something to remember. A session in
PostgreSQL is durable by construction, so a restart does not sign every store owner out,
and there is no cache-versus-truth split to reason about.

**What a fixed window costs.** It is less accurate than a sliding window at the boundary:
a caller can spend a full allowance at the end of one window and another at the start of
the next, so a determined caller gets up to twice the limit in a short burst. For OTP
requests that is a nuisance rather than a weakness, because the code itself still expires
in five minutes and attempts are still capped per challenge. A sliding window needs either
a sorted set or a row per event, which is the point at which Redis starts earning its
keep.

**What PostgreSQL costs here.** Every rate-limit check is a write, and writes replicate.
At pilot scale, three stores and a few hundred orders, this is not measurable. At a scale
where it is, the trigger above has already fired.

**The interface is the escape hatch.** `consumeRateLimit(sql, rule, now)` takes the
connection as an argument and returns a decision. Moving it behind Redis is a new
implementation of one function, not a change to any caller.
