# Stage S — Application Spine Implementation Plan

> Steps use checkbox (`- [ ]`) syntax. Tasks are strictly ordered: each one is the previous
> one's first caller. Do not start a task before its predecessor's verification passes.

**Goal:** Give every module a real caller, reached over HTTP, under a tenant context, with
failures that carry taxonomy codes and logs that cannot contain a buyer's phone number.

**Why this first.** Ten modules are tested libraries that no running process has ever
invoked. An interface exercised only by its own tests is usually wrong in ways those tests
cannot see, because the test and the interface were written by the same person in the same
hour under the same assumptions. Every module built on top of an untested seam inherits it.

**Architecture:** Two Next.js applications sharing one set of modules, per
[`architecture/overview.md`](../../architecture/overview.md). `apps/storefront` resolves its
tenant from the `Host` header; `apps/admin` resolves its tenant from the signed-in owner's
membership and never from a header. Both compose modules through published interfaces only.
Long-running work goes to PostgreSQL-backed job queue rows drained by `workers/jobs`.

**Tech stack:** Existing. TypeScript 5 strict, Next.js 16, PostgreSQL 16 via `pg`, Vitest,
dependency-cruiser. New runtime dependencies: none in the spine except an S3-compatible
client, and that arrives in Stage E with the asset pipeline, not here.

**Spec:** [`../specs/2026-09-11-production-roadmap-design.md`](../specs/2026-09-11-production-roadmap-design.md)
section 4. Parent spec [`../specs/2026-09-04-talla-design.md`](../specs/2026-09-04-talla-design.md)
sections 6, 12, 16.

---

## Global constraints

Everything in [`CLAUDE.md`](../../../CLAUDE.md) binds. The ones this stage will actually
collide with:

- **The client never sends a price.** Totals are recomputed server side (spec 12.5).
- **Buyer PII never appears in a log line, including inside error payloads** (spec 16.5).
  Task 5 makes this a compiler property; until then, do not add logging.
- **Session cookies are host-only.** Never scoped to the parent domain (spec 12.4).
- **Every tenant-scoped table has row-level security.** No exceptions (spec 12.3).
- **Untrusted images are parsed only inside the sandboxed worker** (spec 12.2).
- **Migrations are forward-only.** Never edit one that has shipped. Task 2 enforces this
  with a checksum rather than a convention.
- **Arabic string first, then English. Zero em-dashes in anything a user sees** (CLAUDE.md 6).
- **No raw colour, size, duration, radius or easing outside `tokens.css`** (CLAUDE.md 1).
- A failure returns a `Result` carrying an `ErrorCode`. Never a free-text `Error` string.

---

## File structure

| Path | Responsibility |
| --- | --- |
| `packages/sensitive/` | `Sensitive<T>`, `conceal`, `reveal`. Zero dependencies, importable anywhere |
| `packages/config/` | Typed environment reader. Validates everything at boot, reports all problems at once |
| `packages/observability/` | JSON-line logger that will not accept a `Sensitive` value, plus the redactor |
| `packages/database/src/migrate.ts` | Forward-only migration runner with checksums |
| `packages/database/migrations/003-owner-identity.sql` | Owners, membership, challenges, sessions, rate limits |
| `packages/http/` | Trace ids, same-origin write check, environment-dependent security headers. Shared by both apps |
| `apps/storefront/proxy.ts` | Trace id, HSTS, origin check, CSP nonce. Named `proxy`, not `middleware`: Next 16 renamed the convention |
| `apps/storefront/server/` | Composition root, `withTenant`, route handlers. Never imported by a component |
| `apps/admin/` | Separate Next application on the dedicated admin origin |
| `apps/admin/server/` | Composition root, `withOwnerTenant`, owner auth, upload |
| `workers/jobs/` | Drains the `jobs` table. Lease, run, retry with backoff, dead-letter |
| `scripts/seed-dev.ts` | One tenant, two garments, stock. Local development renders without a database dump |
| `docker-compose.yml` | PostgreSQL, storefront, admin, image worker, job runner |

---

### Task 1: `packages/sensitive`, `packages/config`, and the client/server boundary rule

**Why a separate `sensitive` package.** `Sensitive<T>` must be importable by `config`,
`observability`, and `commerce` with no cycle and no dependency of its own. Putting it in
`observability` would make `config` depend on a logger it does not use. Putting it in
`modules/shared` would invert the layering: `packages/*` is infrastructure, `modules/*` is
domain, and this is a type-system tool, not domain vocabulary.

- [x] Create `packages/sensitive` with the workspace's standard `package.json` and
      `tsconfig.json` shape (copy `packages/tokens` and drop the `generate` script).
- [x] Define the wrapper as an **opaque object**, not a branded string:
      `type Sensitive<T> = { readonly [brand]: typeof brand; readonly inner: T }`. A branded
      string stays assignable to `string` and therefore stays loggable; a wrapper does not.
- [x] Export `conceal<T>(value: T): Sensitive<T>` and `reveal<T>(value: Sensitive<T>): T`.
      Give `reveal` a doc comment naming the only legitimate call sites: the privacy box and
      the OTP delivery adapter.
- [x] Add `toJSON` on the wrapper returning the literal string `[sensitive]`, so an
      accidental `JSON.stringify` of a containing object cannot spill the value.
- [x] Test: `JSON.stringify({ phone: conceal('+201000000000') })` contains no digits.
- [x] Create `packages/config` with `readConfig(env: NodeJS.ProcessEnv): Config`.
- [x] Validate every variable in the spec's S1 table. Collect **all** problems and throw one
      `ConfigError` listing them. Never include a value in the message, only the name.
- [x] Decode the four 32-byte base64 secrets, returning each as `Sensitive<Uint8Array>`.
      Reject any that is not exactly 32 bytes after decode.
- [x] Assert the four secrets are pairwise distinct. Reusing an AES key as an HMAC key looks
      tidy and is a real weakness.
- [x] Write `.env.example` with every variable present and every value obviously fake.
      `.gitignore` already allows this one file.
- [x] Add `no-client-into-server` to `.dependency-cruiser.cjs`: `from` `(^|/)apps/[^/]+/(components|app)/`,
      `to` `(^|/)apps/[^/]+/server/`, severity error.
- [x] Plant a fixture for it under `test/fixtures/client-into-server/` mirroring the shape of
      `test/fixtures/boundary-violation/`, and assert in `test/boundaries.test.ts` that the
      gate fails on it. A rule that never matches anything reports green while the boundary
      dissolves.
- [x] Extend the "passes on the real tree" assertion in `test/boundaries.test.ts` to include
      `apps`. The root `boundaries` script already cruises it; the test does not.
- [x] Add `apps/*/test/**/*.test.ts` to `vitest.config.ts` include list.

**Verify:** `pnpm typecheck && pnpm lint && pnpm boundaries && pnpm test`. A deliberate
`import { container } from '../server/container.ts'` inside a component fails `pnpm boundaries`.

---

### Task 2: Migration runner and the RLS coverage gate

- [x] `packages/database/src/migrate.ts`: read `migrations/*.sql`, sort by numeric prefix,
      apply each in its own transaction, record `version`, `sha256`, `applied_at` in
      `schema_migrations`.
- [x] **A shipped migration whose checksum no longer matches is a hard failure**, naming the
      file. This is what turns "forward-only, never edited" from a sentence in CLAUDE.md into
      a mechanism.
- [x] Run the runner with `TALLA_MIGRATION_DATABASE_URL`, never the application role.
- [x] Expose it as `pnpm --filter @talla/database migrate`.
- [x] Write `packages/database/test/rls-coverage.test.ts`: apply every migration to an empty
      database, then query `pg_class` and `pg_policies` and assert that every table with a
      `tenant_id` column has `relrowsecurity`, `relforcerowsecurity`, and at least one policy.
- [x] Encode the **platform table allowlist** in that test as a `const` with one line of
      justification per entry. Entries at this point: `tenants`. Task 3 adds `owners`,
      `owner_tenants`, `owner_challenges`, `sessions`, `rate_limits`. Adding to this list must
      be a visible diff somebody has to defend.
- [x] Test the gate itself: a temporary table with a `tenant_id` and no policy makes the
      assertion fail. Same reasoning as the boundary fixture.
- [x] Add a migration-apply step to `.github/workflows/ci.yml` before `pnpm test`, against
      the existing PostgreSQL service.
- [x] Update the CI gate table in [`CONTRIBUTING.md`](../../../CONTRIBUTING.md): "RLS
      isolation test" and a new "Migration apply" row move from `Phase 1` to `Yes`.

**Verify:** migrations apply to an empty database; the coverage assertion passes; editing a
shipped migration's body fails the runner; a policy-less tenant table fails the gate.

---

### Task 3: Owner identity, sessions, and rate limits

At the moment an owner types a phone number, **no tenant is known**, so none of these tables
can sit under a tenant policy. They are platform tables, like `tenants`.

- [x] Write `003-owner-identity.sql`. Do not edit `001` or `002`.
- [x] `owners (id, phone_hash unique, created_at, disabled_at)`.
- [x] `owner_tenants (owner_id, tenant_id, role, created_at)`. This is the table that decides
      which tenant you are allowed to become, which is exactly why it cannot be governed by a
      policy keyed on the tenant you claim to be.
- [x] `owner_challenges (id, phone_hash, ip_hash, code_hash, attempts, expires_at, consumed_at, created_at)`
      with rate indexes mirroring `phone_challenges` in `002`.
- [x] `sessions (id, owner_id, token_hash, created_at, last_seen_at, expires_at, rotated_from)`.
- [x] `rate_limits (bucket, window_start, count)`, primary key `(bucket, window_start)`.
- [x] Grant the narrowest workable set to `talla_app`, following the grant style in `001`.
- [x] Add `owner_tenants` to the platform allowlist in the RLS coverage test with its
      justification. Corrected from "all five": only tables carrying a `tenant_id` are in the
      gate's scope, so `owners`, `sessions`, `owner_challenges` and `rate_limits` are not
      exemptions, they are simply not tenant-scoped data.
- [x] Implement owner auth in `modules/tenancy/internal/` behind the module's published
      interface: `startOwnerLogin`, `completeOwnerLogin`, `resolveSession`, `endSession`.
- [x] Store only `sha256` of a 256-bit random cookie token. A leaked backup must not hand
      over live sessions.
- [x] Rotate the session id on login. Idle timeout on admin.
- [x] Fixed-window rate limiting per phone hash and per IP hash on OTP request, OTP verify,
      and order submission.
- [x] Return the codes that already exist: `AUTH_OTP_INVALID`, `AUTH_OTP_RATE_LIMITED`,
      `AUTH_OTP_DELIVERY_FAILED`, `AUTH_SESSION_EXPIRED`, `AUTH_FORBIDDEN`. None may reveal
      whether a number is registered.
- [x] Test against PGlite for policy and transaction behaviour, and add a real-PostgreSQL
      test for concurrent OTP verification, following ADR-0017.

**Verify:** an owner with two stores gets both in their membership; a wrong code increments
attempts and locks at the cap; an expired session resolves to `AUTH_SESSION_EXPIRED`; an
unregistered number and a registered one are indistinguishable in response and timing.

---

### Task 4: Request pipeline

- [x] `apps/storefront/proxy.ts`: generate a trace id, set HSTS, reject a non-GET whose
      `Origin` does not match its own origin. No database call.
      Two corrections from the bundled Next 16 docs: the file is `proxy.ts`, not
      `middleware.ts`, and Proxy now defaults to the Node.js runtime rather than the edge.
      The shared primitives live in the new `packages/http` so the two apps cannot drift.
- [x] `apps/storefront/server/request.ts`: `withTenant(request, work)` resolving `Host`
      through the existing `subdomainFromHost`, then `database.tenant(...)` so every query
      runs under `SET LOCAL app.current_tenant`.
- [x] Carry the trace id into the request context and onto the response, as far as there is
      anything to carry it to. The logger is Task 5 and `toWireError` is Task 6; each picks
      up the id already on the context rather than minting its own.
- [x] Resolution failure returns the same response for "no such tenant" and "suspended",
      per the tenancy module's existing contract.
- [ ] **Moved to Task 7.** `apps/admin/server/request.ts`: `withOwnerTenant(request, work)`
      resolving the tenant from the session's `owner_tenants` membership, never from a header.
      This plan had an ordering error: the file cannot exist before `apps/admin` is
      scaffolded, which is Task 7. The rule it enforces is already implemented and tested as
      `authorizeTenant` in Task 3, so only the thin request binding is outstanding.
- [x] A requested tenant outside the owner's membership fails `AUTH_FORBIDDEN`. Implemented
      and tested in Task 3 as `authorizeTenant`; Task 7 wires it to a request.
- [x] Test: a storefront request carrying a forged `Host` for another tenant reads none of
      that tenant's rows. Test: an admin request naming a tenant the owner does not belong to
      is refused.

**Verify:** both helpers hold under test; no query in either app runs outside a tenant
transaction.

---

### Task 5: Observability with PII kept out by construction

- [x] `packages/observability`: `logger.info|warn|error(event, fields)` emitting one JSON
      object per line to stdout. Fields: `level`, `event`, `traceId`, `tenantId`, `code`,
      `durationMs`, plus event fields.
- [x] Type the field values so a `Sensitive<T>` **does not compile** at a log site. This is
      the whole point of Task 1's wrapper; verify it with a `@ts-expect-error` test.
- [x] Add a runtime redactor scanning each serialized line for E.164 patterns and long digit
      runs, as defence in depth.
- [x] **Assert in a test that the redactor never fires** on the real logging paths. Made a
      property rather than a list: the logger defaults to the `throw` policy when
      `NODE_ENV=test`, so any test that logs phone-shaped text fails, including call sites
      that do not exist yet.
- [x] Wrap buyer name, phone and address in `Sensitive` at the boundary where they enter
      `modules/commerce`, and `reveal` only inside the privacy box and the OTP adapter.
      Two shape changes fell out: `privacy.sealBuyer` returns the ciphertext and the phone
      index together so the caller never has a reason to unwrap, and `verifyPhoneToken` now
      takes the phone index instead of the number.
      **Known gap:** the owner's own phone in `modules/tenancy` is still a bare `string`.
      It is validated and hashed at the same boundary, and it becomes `Sensitive` when the
      admin route that receives it lands in Task 7.
- [x] No metrics backend. Emit timing as log fields; that is what two people can operate.

**Verify:** a test that logs a complete buyer record produces output containing no phone
digits, and the redactor did not fire.

---

### Task 6: Wire the error taxonomy

The catalogue is 419 lines with 35 codes and is imported exactly once in the whole
repository, as a type. Meanwhile `modules/commerce/internal/checkout.ts` raises
`new Error('ORDER_INVALID_INPUT')`: the right code carried as the one thing spec 16.5
forbids.

- [x] Replace every free-text `throw new Error('CODE')` with a code-carrying throw, across
      commerce, assets and ingest, and return a `Result` from the entry points a route
      calls. The throw stays inside `database.tenant` because work in there must throw to
      roll back; `asResult` converts at the boundary and lets anything that is not a
      checkout code keep propagating, so a bug is never collapsed into a typed failure.
- [x] Write one HTTP mapper calling `toWireError`, returning status plus Arabic-first copy.
- [x] Confirm internal codes collapse to `INTERNAL_ERROR` with the trace id, and that no
      buyer field can reach a wire error. `WireError` already has no room for one; keep it
      that way.
- [x] Write a coverage test walking every code in `errorCatalog` and asserting each is either
      raised somewhere in the tree or listed in an explicit `NOT_YET_REACHABLE` map naming the
      stage that reaches it. A taxonomy nobody raises is documentation.

**Verify:** every raised code round-trips through `toWireError`; the coverage test lists no
unaccounted code.

---

### Task 7: `apps/admin` — upload, confirm, publish, and the job runner

- [x] Scaffold `apps/admin` as a second Next application. Reuse the storefront's
      `next.config.ts` header set, its font loading, and `tokens.css`. Admin is a different
      design track; it is not a different design system.
- [x] `apps/admin/server/container.ts`: pool, owner auth, ingest, job enqueuer. It must not
      construct checkout. Guard the import with a `globalThis.window` check.
- [x] Sign in with phone OTP; if the owner has more than one store, pick one.
- [x] Upload photos. Bytes go straight to the sandboxed image worker and nothing else parses
      them (spec 12.2). Reject with the `INGEST_*` codes that already carry copy.
- [x] Show the garment moving `draft → processing → confirmation → ready`.
- [x] Confirm or correct derived fields, through `preserveConfirmations` so a re-run never
      overwrites an owner's correction. **Partly deferred, honestly:** the review screen and
      the publish path exist, but there are no derived fields to correct until the
      understanding stage produces a spec in Stage E, so `preserveConfirmations` has no
      caller yet. The screen shows what is known and says so.
- [x] Write an `audit_log` row for every privileged action. `recordAudit` writes inside the
      same transaction as the change, so an action and its record cannot come apart, and the
      append-only trigger from `001-initial.sql` is exercised for the first time.
- [x] **Moved here from Task 4.** `apps/admin/server/request.ts`: `withOwnerTenant`, which
      takes the owner from the session and the tenant from the route, and refuses any pair
      absent from `owner_tenants`. A store the owner does not belong to and a store that does
      not exist fail identically.
- [x] `workers/jobs`: poll with `FOR UPDATE SKIP LOCKED`, take a lease, run the stage, extend
      the lease on progress, retry with exponential backoff, dead-letter after a capped
      attempt count with the taxonomy code in `error_code`.
- [x] Test: two runners never take the same job. Test: a crashed runner's lease expires and
      the job is retried. Test: a job that fails past the cap is dead-lettered, not looped.

**Verify:** an owner signs in, uploads, and a garment reaches `confirmation` with audit rows
written and no untrusted byte parsed outside the sandbox.

---

### Task 8: Real catalogue, real orders, CSP, deployment

- [x] `apps/storefront/server/container.ts`: pool, privacy box, checkout, phone verification,
      tenancy. Guard the import.
- [x] Convert `app/page.tsx` to a server component reading the resolved tenant's catalogue
      under a tenant transaction, passing it to the existing client component.
- [x] **Delete the hardcoded `products` array** from `components/storefront.tsx`. Keep
      `colorHex` as catalog data read from the row, which is what it already documents itself
      as.
- [x] `scripts/seed-dev.ts`: one tenant, the tee, the jean, stock. Local development must
      still render a page from a clean clone.
- [x] Routes, all origin-checked, rate-limited and tenant-scoped: `POST /api/quote`,
      `POST /api/phone/challenge`, `POST /api/phone/verify`, `POST /api/orders`,
      `GET /api/health` (no database), `GET /api/ready` (database ping).
- [x] `POST /api/orders` takes an idempotency key, recomputes the total, and refuses a
      mismatch with `ORDER_TOTAL_MISMATCH`. The client never sends a price.
- [x] CSP with a middleware-generated nonce: `script-src 'self' 'nonce-…' 'strict-dynamic'`,
      `object-src 'none'`, `base-uri 'none'`, `frame-ancestors 'none'`,
      `img-src 'self' data: blob:`, `worker-src 'self' blob:`.
- [x] `style-src` needs `'unsafe-inline'` because `next/font/local` and Next's own injection
      emit inline style. Write that in a comment beside the header with the condition that
      closes it, rather than leaving a future reader to assume it was considered.
- [x] One Dockerfile per application using Next standalone output.
- [x] `docker-compose.yml`: PostgreSQL, storefront, admin, image worker, job runner.
- [x] Add a bundle-size budget gate. It measures `rootMainFiles` from Turbopack's
      `build-manifest.json`, gzipped: 166 KB for both applications, and Three.js is not in
      it, which is the code splitting working. A first version reached for
      `app-build-manifest.json`, which Turbopack does not emit, and fell through to
      measuring every chunk in the output directory: 359 KB, counting the viewer as though
      a buyer downloaded it before seeing the page.
- [x] Update [`CONTRIBUTING.md`](../../../CONTRIBUTING.md) and
      [`2026-09-07-implementation-status.md`](2026-09-07-implementation-status.md) to match
      what is now live.

**Verify:** the Stage S exit gate below.

---

## Stage S exit gate

- [x] A buyer loads a tenant subdomain, sees a catalogue read from PostgreSQL, builds an
      outfit, verifies a phone, and places a cash-on-delivery order that lands in `orders`
      with an encrypted buyer record. Runs in CI as one end-to-end test.
- [ ] An owner signs in with OTP on the admin origin, uploads photos, and moves a garment to
      `confirmation`. **Outstanding.** The pieces are covered separately (owner auth,
      `withOwnerTenant`, the sandboxed worker, the queue), but no single test drives the whole
      admin path, because uploading needs the Docker sandbox and this machine has no daemon.
- [x] Migrations apply to an empty database and the RLS coverage assertion passes.
- [x] A test logs a complete buyer record and the output contains no phone digits.
- [x] Every code raised in the codebase resolves through `toWireError`.
- [ ] `docker compose up` gives a working system from a clean clone. **Unverified here.**
      The compose file, both Dockerfiles and the seed script are written, and CI builds both
      images, but the Docker daemon is not running on this machine so the stack has never
      actually been brought up.
- [x] The full existing gate stays green: typecheck, lint, format, boundaries, generated
      contracts current, tests, secret scan, dependency audit, build.

---

## ADRs this stage writes

Each lands in the same pull request as the code that makes the decision real.

- [x] **0019** Sessions and rate limits in PostgreSQL, Redis deferred. Trigger to revisit:
      the styling result cache, or rate-limit write volume becoming visible in database load.
- [x] **0020** Sensitive values are opaque wrappers, not branded strings.
- [x] **0022** Owner identity is platform-level; tenant membership is a join.

ADR-0021 (S3-compatible object storage) belongs to Stage E, where the adapter is written.

---

## Self-review

Checked before starting:

- **No task depends on a later task.** Task 1 has no caller; Task 8 calls everything.
- **No new runtime dependency** in the spine. Every new package is workspace-local and
  zero-dependency.
- **No migration is edited.** Task 3 adds `003`; `001` and `002` are untouched.
- **No gate is skipped or softened.** Two gates move from `Phase 1` to live in Task 2, and
  one is added in Task 8.
- **Nothing here produces Phase 0 evidence.** The truth test needs 50 real garments from 3
  real stores judged by real owners, and no amount of this work moves that number
  ([ADR-0017](../../decisions/0017-development-evidence-and-database-testing.md)).
