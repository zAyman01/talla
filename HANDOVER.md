# Talla — handover

Everything you need to pick this up. Written 2026-09-12, against commit `e4ea325` on
`master` (https://github.com/zAyman01/talla).

Read this once end to end before touching anything. The parts that will cost you a day if
you skip them are [§3 Getting it running](#3-getting-it-running) and
[§9 Landmines](#9-landmines).

---

## Contents

1. [What Talla is](#1-what-talla-is)
2. [Where the truth lives](#2-where-the-truth-lives)
3. [Getting it running](#3-getting-it-running)
4. [The map](#4-the-map)
5. [The rules that are not negotiable](#5-the-rules-that-are-not-negotiable)
6. [What works today](#6-what-works-today)
7. [The gates](#7-the-gates)
8. [What is left, and what is blocked](#8-what-is-left-and-what-is-blocked)
9. [Landmines](#9-landmines)
10. [If you only do three things](#10-if-you-only-do-three-things)

---

## 1. What Talla is

An Arabic-first, mobile-first 3D garment storefront for Egyptian clothing stores. A buyer
arrives at a store's subdomain, dresses a mannequin from that store's catalogue, sees the
fit in centimetres, and places a cash-on-delivery order. A store owner signs in on a
separate admin origin with a phone code, uploads photographs, and publishes a garment.

Multi-tenant: one deployment, many stores, each on its own subdomain, isolated in the
database by row-level security rather than by application code remembering to filter.

**The product thesis is not yet proven, and this is the single most important thing in this
document.** Spec §22 puts a truth test ahead of everything: 50 real garments from 3 real
stores, shown to real owners, with the gate at roughly 70% answering yes to "would you
publish this image?" Below that, the fully-automatic thesis is wrong and the correct
response is a pivot, not more engineering. **Nothing in this repository moves that number.**

---

## 2. Where the truth lives

| Document | What it is |
|---|---|
| [`docs/superpowers/specs/2026-09-04-talla-design.md`](docs/superpowers/specs/2026-09-04-talla-design.md) | **The spec. The source of truth.** If code and spec disagree, one of them is a bug and which one is a decision, not an accident |
| [`CLAUDE.md`](CLAUDE.md) | Working rules. Applies to humans and agents equally. Read before writing anything |
| [`docs/decisions/`](docs/decisions/) | 22 ADRs. If you are about to decide something, check here first. If one is wrong, supersede it; never deviate quietly |
| [`docs/frontend/`](docs/frontend/) | Design system, motion, accessibility, and `tokens.css` |
| [`docs/superpowers/specs/2026-09-11-production-roadmap-design.md`](docs/superpowers/specs/2026-09-11-production-roadmap-design.md) | The road from "library shelf" to "three pilot stores". Stages S, E, G, O. **§2 is a dated snapshot and is now history** — it says so at the top |
| [`docs/superpowers/plans/2026-09-11-stage-s-application-spine.md`](docs/superpowers/plans/2026-09-11-stage-s-application-spine.md) | Stage S, 86 items, **no open items** |
| [`docs/superpowers/plans/2026-09-12-stage-g-and-o.md`](docs/superpowers/plans/2026-09-12-stage-g-and-o.md) | Stage G and O. **This is the live tracker.** Start here |
| [`docs/operations/runbook.md`](docs/operations/runbook.md) | Incidents, backups, restores, data-subject requests. Every command in it has been run |
| [`CONTRIBUTING.md`](CONTRIBUTING.md) | Gates, commit format, definition of done |

`docs/superpowers/plans/2026-09-07-implementation-status.md` predates Stage S and is stale.
Ignore it.

---

## 3. Getting it running

Node 24+, pnpm 11+, Docker. Everything below has been run on Windows with Git Bash and is
expected to work unchanged on Linux and macOS.

### The whole system

```bash
pnpm install
cp .env.example .env          # works as written for local development
docker compose up -d --wait
docker compose run --rm seed
```

Then open **`http://nasij.localhost:3000`** (the seeded store) and
**`http://admin.localhost:3001`** (the owner sign in). Chromium resolves `*.localhost` to
loopback on its own; on Linux CI you need an `/etc/hosts` line, which
[`.github/workflows/ci.yml`](.github/workflows/ci.yml) adds.

Five services: `postgres`, `migrate` (applies migrations then exits), `storefront`,
`admin`, `jobs`. The image worker is not a service on purpose: it is spawned per upload
with no network, which is the point of it.

### One app on the host, with hot reload

```bash
node scripts/dev.ts storefront     # or: admin
```

This exists because Next reads a `.env` next to the app it is serving and this repository
keeps one `.env` at the root, which `docker compose` hands to five services. Use it rather
than `next dev` directly.

### The tests

```bash
pnpm test                      # 42 files, 273 tests, ~25 s
```

Four suites and two gates **skip themselves** unless the environment gives them what they
need. That is how a stale test once sat green for months asserting nothing. To run
everything:

```bash
docker compose up -d postgres
docker exec talla-postgres-1 psql -U postgres -d talla_dev -c 'CREATE DATABASE talla_test'
docker build -f workers/image/Dockerfile -t talla-image-worker:local .
pnpm exec playwright-core install chromium chromium-headless-shell

TALLA_TEST_IMAGE_SANDBOX=1 \
TALLA_TEST_DATABASE_URL=postgresql://postgres:local-development-only@localhost:5432/talla_test \
  pnpm test

TALLA_GATE_URL=http://nasij.localhost:3000 \
TALLA_GATE_ADMIN_URL=http://admin.localhost:3001 \
  pnpm gates
```

`pnpm gates` needs the full stack up: it measures the production images, not a dev server.

### Every gate, in the order CI runs them

```bash
pnpm typecheck && pnpm lint && pnpm format:check && pnpm boundaries
pnpm generate && git diff --exit-code -- packages/garment-spec/src/generated packages/tokens/src/generated
pnpm test
pnpm build && pnpm budget
pnpm gates
```

---

## 4. The map

Ten modules (spec §5), each imported **only** through its `index.ts`. A dependency-cruiser
rule fails the build otherwise; it is not a convention, it is enforced.

```
modules/     ingest  understanding  blocks  solver  assets
             viewer  styling  commerce  tenancy  shared

packages/    config  database  errors  garment-spec  http
             observability  sensitive  tokens  trial

workers/     image (sandboxed, no network)  jobs (queue + retention)  gpu (interface only)

apps/        storefront (buyers, tenant subdomains)
             admin (owners, one dedicated origin)

scripts/     dev  seed-dev  data-subject  bundle-budget  prepare-fonts  prepare-references
```

**Callers, honestly.** `tenancy`, `commerce`, `blocks`, `viewer`, `ingest` and `shared` are
wired into the apps. `assets` and `solver` are referenced only as types by `workers/gpu`,
which is an interface with no implementation. `understanding` holds confirmation
preservation and nothing else. **`styling` has zero callers and no stage assigns it one** —
the ranker is written and tested and no screen uses it. That is a hole in the roadmap, not
in the code.

---

## 5. The rules that are not negotiable

Each is expensive or impossible to retrofit. From `CLAUDE.md` §4.

| Rule | Where |
|---|---|
| Every tenant-scoped table has row-level security. No exceptions, no "add it later" | Spec 12.3 |
| Untrusted images are parsed only inside the sandboxed, network-isolated worker | Spec 12.2 |
| Buyer PII never appears in a log line, including inside error payloads | Spec 16.5 |
| The client never sends a price. Totals are recomputed server side | Spec 12.5 |
| Session cookies are host-only. Never scoped to the parent domain | Spec 12.4 |
| Animate `transform` and `opacity` only | Spec 14.1 |
| Every asset publish passes the size budget or the garment does not go live | Spec 11.3 |

And two more from the same file that bite daily:

- **No raw colour, size, duration, radius or easing outside `docs/frontend/tokens.css`.**
  If what you need is missing, add it to the token file and say so.
- **Arabic string first, then English. Zero em-dashes in anything a user sees.**

Migrations are forward-only. The runner records a sha256 per applied file and refuses to
start if a shipped one changed.

---

## 6. What works today

### The buyer path, end to end

`apps/storefront/test/end-to-end.test.ts` drives it: subdomain resolves a tenant →
catalogue read from PostgreSQL under the tenant transaction → outfit → **server-computed**
total → phone OTP → cash-on-delivery order with an encrypted buyer record → a replay of the
same submission returns the same receipt rather than a second order.

### The owner path, end to end

`apps/admin/test/end-to-end.test.ts`: phone code → session → three photographs through the
network-isolated container → garment at `processing` with a job queued in the same
transaction → queue drained → owner confirms → `ready`, with both steps on the audit log
under the owner who took them.

Two stubs in that test, both marked in place: the understanding handler is Stage E's, and
the sanitizer falls back to a stub only where no Docker daemon exists.

### Underneath

- **Config** validates 13 variables, collects every problem and throws once, never prints a
  value, and refuses four secrets that are not pairwise distinct.
- **Sensitive\<T\>** is an opaque wrapper, not a branded string (ADR-0020). `reveal` has
  exactly two legitimate call sites.
- **Row-level security** is forced on every tenant table; the app role is
  `NOSUPERUSER NOBYPASSRLS`. A coverage test fails when a new table lacks a policy.
- **The job queue** is `FOR UPDATE SKIP LOCKED` with leases, three transactions per job so
  a failure cannot roll back its own attempt counter.
- **Logging** redacts by construction: a buyer record cannot be logged because the type
  will not allow it, and a scanner catches what slips through.
- **The device-tier ladder** decides A/B/C from measured signals before a WebGL context
  exists. Absence of a signal means unknown, not weak, so most of Safari is not put on the
  fallback.
- **Retention** sweeps every active store every six hours and records every sweep,
  including the ones that erase nothing.

---

## 7. The gates

Everything in CI blocks merge. If a gate is wrong, fix the gate; never add a skip.

| Gate | What it fails on | Command |
|---|---|---|
| Typecheck | TypeScript strict, plus `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes` | `pnpm typecheck` |
| Lint | ESLint 9 flat config, `strictTypeChecked` | `pnpm lint` |
| Format | Prettier | `pnpm format:check` |
| Boundaries | A module reached through anything but its `index.ts` | `pnpm boundaries` |
| Generated contracts | `GarmentSpec` or token types edited by hand | `pnpm generate` + `git diff --exit-code` |
| Tests | 42 files, 273 tests | `pnpm test` |
| Migrations | Do not apply twice cleanly, or a shipped checksum changed | CI applies them twice |
| Bundle budget | Storefront critical path over 180 KB gzipped (currently 166) | `pnpm budget` |
| **Accessibility** | Any WCAG 2.2 AA violation, either theme, plus 200% text scaling | `pnpm gates` |
| **Performance** | LCP over 2.5 s or CLS over 0.1 on the throttled reference profile | `pnpm gates` |
| Secret scan | gitleaks over full history | CI |
| Dependency audit | `pnpm audit --audit-level high` | CI |

Current performance numbers: **LCP 2.0 s, CLS 0.000**, measured against the production
images on a profile derived from the Samsung Galaxy A16 (ADR-0012).

Two things the performance gate deliberately does **not** assert:

- **TTFD**, time to first garment dressed. It is the budget that matters most and it
  depends on assets that do not exist yet; asserting it today would measure the parametric
  stopgap against a number written for real published assets.
- **Anything from a real phone.** A build machine over loopback is not p75 on 4G. That is
  the Phase 0 device gate, on the real handset.

---

## 8. What is left, and what is blocked

### Stage E — the engine. Mostly blocked, and not on anything you can fix by working harder.

| | Status |
|---|---|
| **E1** Move the renderer into `modules/viewer` | **Done.** `createMannequinScene` takes a host element and design values; the React component is a thin leaf |
| **E2** The asset pipeline | **Blocked in practice.** `publishBundle` has zero callers and nothing in the repository produces mesh bytes. Its input is `SolvedGarment`, which is E4's output. Building LOD, morph packing and KTX2 now means another well-tested library with no caller, against an imagined input |
| **E3** Understanding (segmentation, colour) | **Blocked on a decision.** Spec §24 leaves the model choice open, to be made from Phase 0 evidence |
| **E4** The Dress Solver | **Blocked on a decision.** Same: the cloth solver is deliberately unchosen |
| **E5** Five blocks and real fabrics | **Unblocked.** Two of five exist. ADR-0018 is clear the parametric library is a stopgap, so this is work that gets thrown away |

### Stage G — the gates. Two of three landed.

Accessibility and performance run in CI. **The golden-image gate is deferred, with the
reason written into the plan:** a headless browser draws through SwiftShader, whose output
differs between Windows and Linux by more than a perceptual threshold can absorb without
going blind to real changes. Making it reproducible needs a pinned browser in a container,
which is a second way to run a browser and against ADR-0023's whole point. And the figure
it would photograph is the parametric stopgap that E2 and E4 replace, so every reference
image committed now is thrown away with it.

The geometry underneath is not unguarded meanwhile: `modules/blocks/test/mannequin.test.ts`
asserts topology, grading direction, determinism, and that cloth stays outside the body at
every vertex.

Also open: axe over the admin **store** screen, which is behind a session. The sign-in
screen is covered.

### Stage O — operations and law. Engineering done; the rest is not engineering.

Done: retention on a schedule, the data-subject export and erasure operator path (both
exercised end to end against a real database), the runbook, and a backup/restore drill that
actually ran.

**Not done, on the critical path before a pilot store takes a real order, and not tasks
this repository can close:**

- Privacy notice in Arabic, naming the hosting jurisdiction plainly (ADR-0013).
- The processor and controller split written into the store contract (spec 12.7). Without
  it the store assumes Talla carries the obligation and Talla assumes the store does.
- Egypt PDPL 151/2020 registration and a lawful-basis review.
- A CDN choice. The per-tenant bandwidth alarm and edge rate limiting cannot be built until
  there is a CDN to build them on. Today rate limits are in PostgreSQL (ADR-0019), which
  means a volumetric attack reaches the origin before it is refused.
- Staging: one seeded fake tenant plus one pilot's data with buyer PII redacted.

### And the one that outranks all of it

Phase 0. See §1. Building the engine before running the truth test means the three pilot
stores *become* the truth test, at month six rather than week three, having spent the
intervening months. That is a defensible choice and it should be made on purpose rather
than arrived at by momentum.

---

## 9. Landmines

Things that cost time. Most were found the hard way.

**`docs/` is a build input, not documentation.** `docs/frontend/tokens.css` is imported by
the storefront's stylesheet. Excluding `docs/` from a Docker build context breaks the
build.

**Next's standalone server forces `NODE_ENV=production`** whatever the environment says. So
the compose images can never use `TALLA_OTP_CHANNEL=log`, because config refuses that in
production on purpose: OTP codes in a deployment log are an authentication bypass for
everyone who can read the log. Compose names the channel `sms`, which has **no adapter**, so
phone verification fails at the send inside Docker. Run `node scripts/dev.ts storefront` on
the host when you need that path.

**`talla_app` is `NOLOGIN` by design.** Migration 001 creates it without a password and says
the credential is provisioned out of band. `docker/postgres-init.sql` is that step for
local development, and it runs **only on a clean volume**. If you change it, you need
`docker compose down -v`.

**The privacy operations carry no `tenant_id` in their WHERE clause.** Row-level security
is the only thing scoping `applyRetention`, `exportBuyerOrders` and `eraseBuyerContact`. Run
any of them on a connection that bypasses RLS and they operate on every store at once. Tests
that touch them must `SET ROLE talla_app` — the first draft of the retention test ran as a
superuser and passed while proving the opposite.

**`audit_log` refuses `DELETE`.** A trigger enforces append-only. Test cleanup uses
`TRUNCATE`.

**The test suite is memory bound, not CPU bound.** Most files start a PGlite instance, which
is a WebAssembly PostgreSQL with its own heap. `vitest.config.ts` caps the pool at four
forks for that reason. If you see workers exiting with no message and a different set of
files missing each run, that is memory and not flakiness.

**The browser gates run as their own project** (`pnpm gates`, `vitest.gates.config.ts`),
one file at a time. A Chromium per file cannot share a pool with the main suite.

**Git Bash on Windows rewrites container paths.** `docker exec ... -f /tmp/x` becomes a
Windows path. Prefix with `MSYS_NO_PATHCONV=1`.

**`checkout.place` returns a `Result`, it does not throw.** A test that counts `fulfilled`
promises passes on a service that oversells every garment it has. That exact bug sat in
`test/checkout-postgres.test.ts` for weeks because the suite skipped itself without a
PostgreSQL URL.

**A restore that crosses a data-subject erasure resurrects the erased details.** The dump
predates the erasure. Repeat the erasure after restoring; the audit log names which.

---

## 10. If you only do three things

1. **Run `docker compose up -d --wait && docker compose run --rm seed` and open
   `nasij.localhost:3000`.** Twenty minutes of reading the code is worth less than two
   minutes of seeing the mannequin get dressed.

2. **Read `docs/superpowers/plans/2026-09-12-stage-g-and-o.md`.** It is the live tracker and
   it records *why* each open item is open, not just that it is.

3. **Decide about Phase 0 deliberately.** Everything engineering-shaped that remains is
   either blocked on a technology choice the spec says to make from evidence, or work that
   gets replaced when that choice lands. The highest-value next move is probably not code.

If you do want code, in order of value: **Stage O's CDN-dependent items once a deployment
target exists**, then **E5's three remaining blocks**, then **giving `modules/styling` a
caller** — the suggestion ranker is written, tested, and wired to nothing.

---

*Questions about why something is the way it is: check `docs/decisions/` first, then the
commit message. The commit messages in this repository are long on purpose and explain the
reasoning, not the diff.*
