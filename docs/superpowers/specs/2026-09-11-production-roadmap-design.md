# Talla — Production Roadmap Design

**Status:** Accepted
**Date:** 2026-09-11
**Stage S closed:** 2026-09-12
**Parent spec:** [`2026-09-04-talla-design.md`](2026-09-04-talla-design.md)
**Phase map:** [`../plans/2026-09-06-build-phases.md`](../plans/2026-09-06-build-phases.md)

This document answers one question: what stands between the repository as it is today and
a Talla that three pilot stores can run their business on.

It does not replace the design spec. The spec decides what Talla is; this decides the
order in which the missing parts get built, what each one must satisfy before it counts
as done, and which of them cannot be finished by engineering at all.

---

## Contents

1. [What "production ready" means here](#1-what-production-ready-means-here)
2. [Where the repository actually stands](#2-where-the-repository-actually-stands)
3. [The finding that orders everything else](#3-the-finding-that-orders-everything-else)
4. [Stage S — Application spine](#4-stage-s--application-spine)
5. [Stage E — The engine](#5-stage-e--the-engine)
6. [Stage G — The gates](#6-stage-g--the-gates)
7. [Stage O — Operations and law](#7-stage-o--operations-and-law)
8. [Decisions this roadmap makes](#8-decisions-this-roadmap-makes)
9. [What this roadmap cannot deliver](#9-what-this-roadmap-cannot-deliver)
10. [Sequencing](#10-sequencing)

---

## 1. What "production ready" means here

Production ready is defined against the customer in spec section 3, not against a general
notion of scale. The target is:

**Three pilot stores, each with 100 to 400 SKUs, running real cash-on-delivery orders for
sixty days, on infrastructure two people can operate without being woken up.**

That definition does work. It rules in tenant isolation, buyer data protection, order
integrity, a store owner who can publish a garment without being on a call, and an
observability story good enough to answer "what happened to order 4412" at nine in the
evening. It rules out horizontal scaling, multi-region failover, a public sign-up funnel,
and anything whose first customer is a Gulf enterprise procurement process.

Everything below is scoped to that definition. Where a decision is deferred because the
pilot does not need it, the deferral is stated with the trigger that ends it.

---

## 2. Where the repository actually stands

> **This section is a snapshot of 2026-09-11 and is kept as written.** Stage S closed on
> 2026-09-12, so the two lists below are now history rather than status: the modules have
> callers, and the application surface that was absent exists. The living record is
> [`../plans/2026-09-11-stage-s-application-spine.md`](../plans/2026-09-11-stage-s-application-spine.md),
> which has no open items. Stages E, G and O below are unchanged and still stand.

### Finished and holding

Phase F is genuinely complete and is better than its plan promised. The workspace builds,
typechecks under strict TypeScript, generates both the `GarmentSpec` contract and the design
tokens, and fails on a planted boundary violation. Eight CI gates block merge, including a
secret scan over full history and a dependency audit.

Three things are further along than the implementation ledger suggests, and it is worth
recording so later work does not rebuild them:

- **The schema is not a sketch.** `001-initial.sql` ships `garments`, `stock`, `orders`,
  `order_lines`, `pins`, an append-only `audit_log` with a trigger that refuses UPDATE and
  DELETE, and a `jobs` queue table with leases and attempt counts. All seven carry
  `ENABLE ROW LEVEL SECURITY`, `FORCE ROW LEVEL SECURITY`, and a tenant isolation policy.
  The `talla_app` role is created `NOSUPERUSER NOBYPASSRLS` with explicit grants, and the
  migration raises if it ever gains either attribute.
- **The error taxonomy is complete and executable.** Thirty-five codes with Arabic-first
  copy and a fix action each, plus `toWireError`, which collapses an internal code to
  `INTERNAL_ERROR` carrying the trace id so detail goes to the trace and not to a screen.
- **Commerce is real.** `createCheckout` runs quote and place against PostgreSQL with stock
  locks, idempotency keys, request hashing, and column-encrypted buyer records, and it is
  tested against a live PostgreSQL 16 for concurrent stock behaviour, not only against
  PGlite.

### Built as a library, never called

| Module | State |
| --- | --- |
| `commerce` | Checkout, phone verification, order state machine, privacy operations. No caller. |
| `tenancy` | Host resolution and connection-scoped tenant transactions. No caller. |
| `styling` | Pure ranker with pins and a capped margin tiebreak. No caller. |
| `ingest` | Sandboxed re-encode via the Docker image worker. Called only by a build script. |
| `blocks` | Parametric mannequin, two garment blocks, fit in centimetres (ADR-0018). Called by the storefront. |
| `assets` | Budget check and publish orchestration over an `AssetStore` interface. No adapter exists. |
| `understanding` | Confirmation preservation only. No segmentation, no colour extraction. |
| `solver` | Interface only. Zero implementation. |
| `viewer` | Interface only. The renderer that exists lives in the storefront component tree. |

### Absent entirely

No HTTP surface of any kind: no route handler, no server action, no middleware, no session,
no composition root. No admin. No configuration schema. No migration runner. No logger. No
deployment artifact for the application. No content security policy.

---

## 3. The finding that orders everything else

**Ten modules are tested libraries that no running process has ever invoked.**

The storefront's catalogue is a two-element `const products` array hardcoded in a client
component. The cart is client state with no destination. `createCheckout` has never been
called by anything except its own test.

This is the largest risk in the repository, and it is not a risk about missing features. An
interface that has only ever been exercised by its own tests is usually wrong in ways the
tests cannot see, because the test and the interface were written by the same person in the
same hour with the same assumptions. The cost of that wrongness compounds: every module
built on top of an untested seam inherits it.

It is also the cheapest risk to retire, because the schema and the taxonomy are already
there. The spine is mostly wiring, not invention.

Therefore: **Stage S comes first, and nothing in Stage E starts until Stage S exits.** The
engine is the moat, but a moat around an empty field is not a defensive position.

---

## 4. Stage S — Application spine

**Goal.** Every module has a real caller, reached over HTTP, under a tenant context, with
failures that carry taxonomy codes and logs that cannot contain a buyer's phone number.

**Entry gate.** Current CI green. (Met.)

### S1. Configuration and the composition root

`packages/config` exposes a typed reader that validates the whole environment at boot and
reports **every** problem at once, not the first. An operator fixing a deployment one failed
boot at a time is a self-inflicted outage. It follows the hand-written validation style
already used in `packages/garment-spec/src/validate.ts`; no new dependency.

| Variable | Holds |
| --- | --- |
| `TALLA_DATABASE_URL` | Application role. Refused at runtime if superuser or `BYPASSRLS`. |
| `TALLA_MIGRATION_DATABASE_URL` | Migration role. Distinct from the application role. |
| `TALLA_ENCRYPTION_KEY` | 32 bytes, base64. Column encryption for buyer records. |
| `TALLA_INDEX_KEY` | 32 bytes, base64. Phone HMAC index. Never the encryption key. |
| `TALLA_PHONE_SECRET` | 32 bytes, base64. OTP challenge and phone token signing. |
| `TALLA_SESSION_SECRET` | 32 bytes, base64. Owner session token hashing. |
| `TALLA_ADMIN_HOST` | The single dedicated admin origin (spec 12.4). |
| `TALLA_STOREFRONT_ROOT_DOMAIN` | Parent domain that tenant subdomains hang from. |
| `TALLA_ASSET_ENDPOINT` / `_BUCKET` / `_ACCESS_KEY` / `_SECRET_KEY` | S3-compatible object storage. |
| `TALLA_OTP_CHANNEL` | `log` in development, a delivery adapter in staging and production. |

Four distinct 32-byte secrets, not one reused four ways. Reusing an AES key as an HMAC key
is the kind of shortcut that survives review because it looks tidy.

**Two applications, not one.** [`architecture/overview.md`](../../architecture/overview.md)
lays out `apps/storefront`, `apps/admin`, and `apps/marketing` as separate applications, and
admin is on a different design track. Spec 12.4 puts admin on a single dedicated origin, and
spec 12.6 wants bot rules on that origin specifically. Separate applications give both for
free, and the buyer bundle never carries a byte of admin code.

This does not contradict ADR-0001. That record rejects splitting the ten **modules** into
services; both applications import the same modules in the same process model. `marketing`
is out of scope for this roadmap: it is static, separately deployed, and nothing depends on
it.

Each application owns its own composition root — `apps/storefront/server/container.ts` and
`apps/admin/server/container.ts` — because they need different dependencies. The storefront
constructs the pool, privacy box, checkout, phone verification, and tenancy. Admin
constructs the pool, owner authentication, ingest, and the job enqueuer, and never
constructs checkout. Shared plumbing stays in `packages/config` and `packages/database`
rather than in a shared container that would hand each application the other's dependencies.

Each container guards its own import: if `globalThis.window` is defined it throws, because a
server container reaching a browser bundle is a leak of connection strings, not a bug to
debug later.

**New boundary rule.** `.dependency-cruiser.cjs` gains `no-client-into-server`, forbidding
`apps/*/components/` from importing `apps/*/server/`. The existing rules police module
boundaries; this one polices the client/server boundary, which is where secrets escape.

**`.env.example`** is committed, with every variable present and every value obviously fake.
`.gitignore` already allows exactly this file.

### S2. Migration runner and the RLS coverage gate

`packages/database/src/migrate.ts` applies `migrations/*.sql` in numeric order, each in its
own transaction, recording `version`, `sha256`, and `applied_at` in `schema_migrations`.

**A shipped migration whose checksum no longer matches is a hard failure.** CLAUDE.md says
migrations are forward-only and never edited after shipping. Today that is a sentence in a
document. The checksum makes it a mechanism.

Then the gate CONTRIBUTING has listed as "Phase 1" since the beginning:

> Apply every migration to an empty database, then assert that every table carrying a
> `tenant_id` column has row-level security enabled, forced, and at least one policy.

A new tenant-scoped table without a policy fails the build. The one exception is an
explicit allowlist of **platform tables** — `tenants`, and the owner identity tables added
in S3 — which are read before a tenant context exists and therefore cannot be under a
tenant policy. The allowlist lives in the test file, one line of justification per entry, so
adding to it is a visible diff someone has to defend.

Migration `003` adds the owner identity tables (S3). No existing migration is edited.

### S3. Owner identity, sessions, and rate limits

Owner authentication is phone OTP with no password (ADR-0007). The awkward part is that at
the moment an owner types their phone number, **no tenant is known yet**, so the lookup
cannot run inside a tenant transaction.

That makes owner identity platform-level, mirroring how `tenants` already works:

```
owners            (id, phone_hash unique, created_at, disabled_at)
owner_tenants     (owner_id, tenant_id, role, created_at)      -- membership
owner_challenges  (id, phone_hash, ip_hash, code_hash, attempts, expires_at, consumed_at)
sessions          (id, owner_id, token_hash, created_at, last_seen_at, expires_at, rotated_from)
rate_limits       (bucket, window_start, count)
```

`owner_tenants` carries a `tenant_id` but is deliberately outside tenant RLS, because it is
the table that decides which tenant you are allowed to become. It goes on the platform
allowlist with that reasoning written next to it.

The cookie carries 256 random bits; only `sha256` of the token is stored, so a leaked
database backup does not hand over live sessions. Cookie flags per spec 12.4: `HttpOnly`,
`Secure`, `SameSite=Lax`, **host-only, never scoped to the parent domain**. The session id
rotates on login. Admin gets an idle timeout; the storefront has no owner session at all.

Rate limits use a fixed-window counter in `rate_limits`, keyed per phone hash and per IP
hash, for OTP request, OTP verify, and order submission. Buyer OTP already rate-limits off
the `phone_challenges` indexes and keeps that mechanism.

Failures use the codes that already exist: `AUTH_OTP_INVALID`, `AUTH_OTP_RATE_LIMITED`,
`AUTH_OTP_DELIVERY_FAILED`, `AUTH_SESSION_EXPIRED`, `AUTH_FORBIDDEN`. None of them reveals
whether a number is registered, which is the same reason `TenantResolution` collapses
"no such tenant" and "suspended tenant" into one response.

### S4. Request pipeline

Both applications carry a `middleware.ts` doing only what is safe at the edge with no
database: emit a trace id, set HSTS, and reject a non-GET request whose `Origin` does not
match its own origin. With `SameSite=Lax` cookies, that origin check is sufficient CSRF
defence and costs no token round trip.

**The two applications reach a tenant by different routes, and the difference is a security
property worth stating.**

`apps/storefront/server/request.ts` exposes `withTenant(request, work)`, which resolves the
`Host` header through the existing `subdomainFromHost` and runs the work inside
`database.tenant(...)`, so every query executes under `SET LOCAL app.current_tenant`. A
buyer request is anonymous, so the host is the only thing that can name the tenant.

`apps/admin/server/request.ts` exposes `withOwnerTenant(request, work)`, which resolves the
tenant from the **session's `owner_tenants` membership**, never from a header. Admin serves
one origin for every store, so a tenant taken from the `Host` header would be a tenant taken
from the attacker. The requested tenant must appear in the signed-in owner's membership or
the request fails `AUTH_FORBIDDEN`.

Tenant resolution failure on the storefront returns the same response as a suspended tenant,
per the tenancy module's existing contract.

### S5. Observability, with PII kept out by construction

Spec 16.5 and CLAUDE.md both say buyer PII never appears in a log line, including inside
error payloads. There is currently no logger for that rule to bind to, so it is a promise
rather than a property.

`packages/observability` makes it structural. A sensitive value is an **opaque wrapper**,
not a branded string:

```ts
type Sensitive<T> = { readonly [brand]: unique symbol; readonly inner: T };
```

The distinction matters. `string & { __sensitive: true }` is still assignable to `string`,
so a branded phone number logs cleanly and the compiler says nothing. A wrapper is not
assignable to the logger's field type, so `logger.info('order.placed', { phone })` does not
compile. The value is unwrapped by `reveal()` at the two places that genuinely need it: the
encryption box, and the OTP delivery adapter.

This costs ergonomics everywhere buyer data is handled, which is precisely where friction is
worth paying for.

Behind that, a runtime redactor scans each serialized line for long digit runs and E.164
patterns. It is defence in depth, and **a test asserts it never fires**: if redaction
triggers, a typed hole exists and the build should say so rather than quietly saving the day.

Log shape is one JSON object per line on stdout — `level`, `event`, `traceId`, `tenantId`,
`code`, `durationMs`, plus event fields. No log transport dependency; the platform collects
stdout. Timing is emitted as log fields rather than to a metrics backend, which is what two
people can actually operate.

### S6. The error taxonomy, wired

The catalogue is 419 lines and is imported exactly once in the entire repository, as a type.
Meanwhile commerce raises `new Error('ORDER_INVALID_INPUT')` — the right code, carried as a
free-text string, which spec 16.5 specifically forbids.

Every failure path returns a `Result` carrying an `ErrorCode`. One HTTP mapper calls
`toWireError` and renders status plus Arabic-first copy. The store-facing and buyer-facing
codes reach a screen; internal codes collapse to `INTERNAL_ERROR` with the trace id.

A test walks every code in the catalogue and asserts each one is either raised somewhere in
the codebase or explicitly listed as not-yet-reachable with the stage that will reach it.
A taxonomy nobody raises is documentation, not a taxonomy.

### S7. Admin: upload, confirm, publish

`apps/admin` is a separate Next application served on `TALLA_ADMIN_HOST`, a single dedicated
origin (spec 12.4). One screen, deliberately ugly, matching the Phase 1 instruction:

1. Sign in with phone OTP, pick a store if the owner has more than one.
2. Upload photos for a garment. Bytes go straight to the sandboxed image worker and nothing
   else parses them.
3. Watch the garment move `draft → processing → confirmation → ready`.
4. Confirm or correct the derived fields; `preserveConfirmations` keeps corrections across a
   re-run.

Every privileged action writes to `audit_log`. The table and its immutability trigger exist
already and nothing has ever written a row.

**The job runner.** The `jobs` table has leases and attempt counts and no process that reads
it. S7 adds `workers/jobs`: poll with `FOR UPDATE SKIP LOCKED`, take a lease, run the stage,
extend the lease on progress, retry with exponential backoff, and dead-letter after a
capped number of attempts with the failure's taxonomy code in `error_code`.

This is the part that first exercises ingest, the Docker sandbox, understanding, and the
confirmation path together over HTTP. It is where wrong interfaces will surface, which is
the reason it is in the spine rather than deferred.

### S8. Real catalogue, real orders, real deployment

`app/page.tsx` becomes a server component that reads the resolved tenant's catalogue under a
tenant transaction and passes it to the existing client component. The hardcoded `products`
array is deleted. A dev seed script creates one tenant, the tee, the jean, and stock, so
local development still renders a page.

Routes, all origin-checked, rate-limited, and tenant-scoped:

| Route | Does |
| --- | --- |
| `POST /api/quote` | Server-authoritative total. The client never sends a price. |
| `POST /api/phone/challenge` | Buyer OTP request. |
| `POST /api/phone/verify` | Buyer OTP verify, returns a phone token. |
| `POST /api/orders` | Idempotency-keyed. Recomputes the total and refuses a mismatch. |
| `GET /api/health` | Liveness. No database call. |
| `GET /api/ready` | Readiness. Database ping. |

**Content Security Policy.** A nonce generated in middleware, `script-src 'self' 'nonce-…'
'strict-dynamic'`, `object-src 'none'`, `base-uri 'none'`, `frame-ancestors 'none'`,
`img-src 'self' data: blob:`, `worker-src 'self' blob:`. Honestly: `style-src` needs
`'unsafe-inline'`, because `next/font/local` and Next's own style injection emit inline
style. That is a real weakness, it is written down here rather than hidden, and it is
revisited when Next offers nonce-based style handling.

`frame-ancestors 'none'` and `X-Frame-Options: DENY` will conflict with the Phase 3 Shopify
widget, which is an embed by definition. That conflict is expected and is one of the reasons
spec 22 requires the threat model to be re-run before the widget ships.

**Deployment.** One Dockerfile per application using Next standalone output, plus a
`docker-compose.yml` bringing up PostgreSQL, the storefront, admin, the image worker and the
job runner, so a new machine is one command from a running system.

**Stage S exit gate**

- A buyer loads a tenant subdomain, sees a catalogue read from PostgreSQL, builds an outfit,
  verifies a phone, and places a cash-on-delivery order that lands in `orders` with an
  encrypted buyer record. Run in CI as one end-to-end test.
- An owner signs in with OTP on the admin origin, uploads photos, and moves a garment to
  `confirmation`. Run in CI.
- Migrations apply to an empty database and the RLS coverage assertion passes.
- A test logs a complete buyer record and the output contains no phone digits.
- Every code raised in the codebase resolves through `toWireError`.
- `docker compose up` gives a working system from a clean clone.

---

## 5. Stage E — The engine

**Entry gate.** Stage S exit gate green.

This is the moat and it carries the project's largest unknown. Spec 24 deliberately leaves
two technology choices open — the segmentation model and the cloth solver — to be decided
from what Phase 0 proves. This roadmap does not pre-empt either.

### E1. Move the renderer into `modules/viewer`

`modules/viewer` is an empty interface. The renderer that exists is
`apps/storefront/components/mannequin.tsx`, which owns the canvas, the camera framing, the
blend, and the settle. Spec section 5 gives that job to the viewer module.

This is architecture drift, and it happened for a defensible reason: the component was
written to prove the mannequin, not to be the module. Resolving it means the module owns
scene construction, the device-tier probe, the A/B/C ladder, and the `webglcontextlost`
fallback to the tier C turntable, while the component keeps only mounting and React
lifecycle. One deliverable, and the tier ladder stops being half-implemented in a leaf.

### E2. A real asset pipeline

`publishBundle` validates and stores packed bytes. Nothing packs any. E2 supplies:

- LOD 0/1/2 by mesh simplification.
- Morph deltas quantized against the base body (ADR-0003), packed so a size change stays a
  vertex blend with no network request.
- KTX2 textures for tiers A and B, WebP for the tier C turntable (never a PNG as a GPU
  texture).
- A 36-frame turntable.
- glb with meshopt compression (ADR-0004), content-addressed on publish (ADR-0009).
- An S3-compatible `AssetStore` adapter implementing `sha256` and `putImmutable`.

Only after this does the asset budget gate mean anything, because only then are there bytes
to measure.

### E3. Understanding

Segmentation, attribute extraction, and colour off the gray card. The model choice belongs
to Phase 0 evidence. What this roadmap fixes is the shape: confidence on every derived
field, and `preserveConfirmations` already guarantees a re-run never overwrites an owner's
correction.

Ingest gains the gray-card detector and the capture-quality assessor that the
`INGEST_GRAY_CARD_MISSING`, `INGEST_TOO_DARK`, `INGEST_BLURRY` and `INGEST_BACKGROUND_BUSY`
codes are already written for.

### E4. The Dress Solver

The single largest unknown in the project. Nothing in Stage S de-risks it, and saying so is
more useful than a plan that implies otherwise.

Its contract is already frozen in `modules/solver/index.ts`: deterministic for a given spec,
block, and body triple, producing a base mesh, morph deltas, a baked settle clip, and a
solve time. Determinism is what makes content addressing meaningful and a re-solve
diagnosable.

When it lands, the fit reading moves from the parametric blocks to the solver, and ADR-0018
requires the gap between the two ease figures to be measured rather than hidden, because
that gap is the error a buyer would have been shown.

### E5. Five blocks and real fabrics

Phase 1 calls for five blocks; two exist. Three more, plus fabric presets that are measured
rather than assumed, plus textures, which the viewer currently has none of.

**Stage E exit gate.** One real garment goes photographs → spec → solve → packed assets →
viewer, inside the budget, with the over-budget fixture failing to publish.

---

## 6. Stage G — The gates

**Entry gate.** Runs alongside Stage E; each gate lands with the code it measures, which is
what CONTRIBUTING already says.

| Gate | Fails when | Lands with |
| --- | --- | --- |
| Migration apply | Migrations do not apply cleanly to an empty database, or a shipped checksum changed | S2 |
| RLS coverage | A tenant-scoped table lacks RLS, FORCE, or a policy | S2 |
| Bundle size budget | The storefront critical path regresses past budget | S8 |
| Asset budget | The over-budget fixture publishes successfully | E2 |
| Golden image render | Perceptual difference beyond threshold on the reference garments | E2 |
| Lighthouse | Any budget in spec 11.1 missed on the throttled reference profile | G |
| Accessibility | Any WCAG 2.2 AA violation on the storefront | G |

Two notes.

**The bundle budget is overdue.** The home page began shipping Three.js in this repository's
current working tree. It is code-split behind `dynamic(..., { ssr: false })`, which is
correct, but "correct today" and "measured on every commit" are different things, and spec
11.1 budgets TTFD in kilobytes.

**Golden image rendering needs a real browser.** Headless WebGL in Node is not close enough
to what a phone does. A browser-driven screenshot with a perceptual threshold is the honest
version, and it is slower, and that is the cost.

---

## 7. Stage O — Operations and law

**Entry gate.** Before the first pilot store takes a real order. Not after.

### Operations

- **Retention scheduler.** `applyRetention` exists as a function with no scheduler. A
  retention policy nothing executes is a policy that will be discovered during an audit.
- **Audit log writes.** The table, its trigger, and its grants exist. Every privileged
  action writes a row, and disputed owner recovery (ADR-0007 names SIM swap as a real
  regional attack) is resolvable from it.
- **Backups and a restore drill.** A backup that has never been restored is not a backup.
  The drill is scheduled, and its result is recorded.
- **Per-tenant bandwidth alarm** (spec 12.6). A scraped catalogue is a CDN invoice, and the
  invoice is usually how you find out.
- **Edge rate limiting and DDoS protection** at the CDN, not at the origin. A volumetric
  attack on a storefront is a direct bandwidth bill.
- **Staging.** One seeded fake tenant, plus one pilot's data with buyer PII redacted. No
  developer runs against production data (spec 6).
- **Incident runbook.** Short. Who is called, how a tenant is suspended, how a bad publish
  is rolled back.

### Law

These are on the critical path and are not engineering tasks, so they are named rather than
hidden inside a ticket.

- **Privacy notice in Arabic**, naming the hosting jurisdiction plainly (ADR-0013).
- **Data-subject export and erasure.** `exportBuyerOrders` and `eraseBuyerContact` exist.
  They need an operator-run path and a record that the path was exercised.
- **The processor/controller split written into the store contract** (spec 12.7). Without
  it, the store assumes Talla carries the obligation and Talla assumes the store does.
- **Egypt PDPL 151/2020** registration and lawful-basis review before the first real order.

**Stage O exit gate.** A restore drill completed and recorded; an export and an erasure
exercised end to end; the privacy notice live; the store contract signed with the split in
it.

---

## 8. Decisions this roadmap makes

Each becomes an ADR in `docs/decisions/` as it is implemented.

**ADR-0019. Sessions and rate limits in PostgreSQL; Redis deferred.**
Spec section 6 places the session store and rate-limit counters in Redis. This roadmap puts
both in PostgreSQL behind an interface. Reason: a second stateful dependency in local
development, CI, and production buys nothing at pilot scale, and the spec's own constraint
that nothing in Redis may be the sole copy of anything is easiest to honour when the copy is
already in PostgreSQL. **Trigger to revisit:** the styling-engine result cache, which is the
first workload that genuinely wants Redis, or rate-limit write volume becoming visible in
database load.

**ADR-0020. Sensitive values are opaque wrappers, not branded strings.**
A branded string remains assignable to `string` and therefore remains loggable. An opaque
wrapper does not compile at a log site. Accepted cost: friction at every buyer-data call
site, which is where friction is wanted.

**ADR-0021. S3-compatible object storage; provider chosen at deployment.**
The `AssetStore` interface needs only `sha256` and `putImmutable`. Writing to the
S3-compatible API keeps AWS, Cloudflare R2, Hetzner, and a local MinIO all available, and
defers a decision that the pilot does not need made. Region is already decided (ADR-0013).

**ADR-0022. Owner identity is platform-level; tenant membership is a join.**
An owner types a phone number before any tenant is known, so owner tables cannot sit under
tenant RLS. They join the small, explicitly justified platform allowlist that the RLS
coverage gate checks against.

---

## 9. What this roadmap cannot deliver

**Phase 0 evidence.** The spec's build order puts a truth test ahead of Phase 1: 50 real
garments from 3 real stores, shown to real owners, with the gate at roughly 70 percent
answering yes to "would you publish this image?" Below that, spec 22 says the
fully-automatic thesis is wrong and the correct response is a pivot.

No amount of Stage S, E, G, or O work moves that number. Neither do the reference
photographs in `fixtures/` — ADR-0017 is explicit that public references support development
and establish nothing about physical colour accuracy, owner acceptance, or phone
performance.

The same applies to the colour gate (median ΔE00 under 3 across 50 garments, measured
against a physical gray card), the device gate (one garment on the reference phone inside
the Instagram in-app browser, timed against TTFD), and the typography gate.

**The risk this creates, stated plainly:** building the spine and the engine without running
the truth test first means the three pilot stores become the truth test, at month six rather
than week three, having spent the intervening months. That is a defensible choice — pilots
produce better evidence than a mock-up review does — but it is a choice, and it should be
made on purpose rather than arrived at by momentum.

**Not deliverable by engineering at all:** the store contract, PDPL registration, the pilot
relationships, and the AOV number that Phase 3 prices against.

---

## 10. Sequencing

```
S1 ─▶ S2 ─▶ S3 ─▶ S4 ─▶ S5 ─▶ S6 ─▶ S7 ─▶ S8 ─▶│ Stage S exit
                                                │
                             ┌──────────────────┴──────────────────┐
                             ▼                                     ▼
                    E1 ─▶ E2 ─▶ E3 ─▶ E4 ─▶ E5            G (each gate with its code)
                             │
                             └──────────────▶ O (before the first pilot order)
```

Stage S is strictly ordered: each part is the previous part's first caller. S1 has no
caller, so it is first; S8 calls everything, so it is last.

Stage E is ordered by dependency, not by importance. E1 and E2 unblock the gates in G. E4 is
the largest unknown and is deliberately not first, because a solver built before the pipeline
that consumes it has nowhere to put its output.

Stage O runs in parallel with E and must complete before a pilot store takes a real order,
not before the pilot is demonstrated.

**One rule holds across all of it**, from `docs/README.md`: a later stage never waives an
earlier stage's gate.
