# Contributing

Talla is at design stage. The repository carries its foundation but no product behavior
yet, so parts of this document describe work that has not started. It is binding on
everything that has.

Read [`CLAUDE.md`](CLAUDE.md) first. It carries the working rules. This file covers
process.

---

## Workflow

Trunk based development. `master` is always releasable.

1. Branch from `master`. Keep the branch shorter than two days of work.
2. Commit in Conventional Commits format.
3. Open a pull request. CI must be green.
4. Squash merge. Delete the branch.

Long-lived branches between two people produce conflicts neither has the context to
resolve. If work is going to take longer than two days, put it behind a feature flag and
merge it half-built rather than holding a branch open.

## Commit format

```
<type>(<scope>): <subject>

<body>

<footer>
```

Types: `feat`, `fix`, `perf`, `refactor`, `docs`, `test`, `build`, `ci`, `chore`.

Scopes match the modules in spec section 5: `ingest`, `understanding`, `blocks`, `solver`,
`assets`, `viewer`, `styling`, `commerce`, `tenancy`, plus `docs` and `infra`.

The subject says what changed. The body says why, and why the alternative was rejected if
there was one. A commit whose body only restates the subject is a commit with no body.

## Review

Most changes merge without a second reader. Two people cannot sustain review on
everything, and pretending otherwise means review becomes a rubber stamp.

**Four areas always require the other person's review**, because a mistake in them is not
recoverable by a follow-up commit:

1. The image worker sandbox and anything that parses untrusted input.
2. Row-level security policies and anything that establishes tenant context.
3. Session handling, authentication, and cookie scope.
4. Order confirmation and any path that computes a price or decrements stock.

## CI gates

Every gate blocks merge. A gate that only warns is a gate that is ignored.

| Gate | Fails when | Live |
|---|---|---|
| Typecheck | Any type error | Yes |
| Lint and format | Any violation | Yes |
| Module boundaries | A module imports another module's internals | Yes |
| Generated contracts current | Regenerating types or tokens changes a committed file | Yes |
| Unit and property tests | Any failure | Yes |
| `GarmentSpec` contract tests | Producer and consumer disagree on the schema | Yes |
| Secret scan | Any high severity finding | Yes |
| Dependency audit | A known vulnerability at high severity or above | Yes |
| Migration apply | Migrations do not apply cleanly to an empty database, or a shipped migration's checksum changed | Yes |
| RLS isolation test | Any tenant-scoped table lacks a policy, or a cross-tenant row is returned | Yes |
| Asset budget | The over-budget garment fixture publishes successfully | Phase 1 |
| Golden image render | Perceptual difference beyond threshold on the reference garments | Phase 1 |
| Bundle size budget | The shared critical path of either application regresses past budget | Yes |
| Lighthouse | Any budget in spec 11.1 missed on the throttled reference profile | Phase 2 |

A gate marked with a phase lands with the code it measures. It is listed here so the
list stays the full set rather than only the convenient part, and the phase it belongs
to is an exit criterion in
[`docs/superpowers/plans/2026-09-06-build-phases.md`](docs/superpowers/plans/2026-09-06-build-phases.md).
The commands the live gates run are the workspace scripts: `pnpm typecheck`, `pnpm
lint`, `pnpm format:check`, `pnpm boundaries`, `pnpm test`, `pnpm generate`, and
`pnpm --filter @talla/database migrate` and `pnpm budget`.

Four test files need more than Node: three want a real PostgreSQL, and one runs the
image worker in its container. They skip themselves when the environment does not
provide those, which is why a local `pnpm test` reports nine skipped and CI reports
none. A suite that is green because it did not run is worse than a red one, so run the
whole thing before opening a pull request:

```
docker compose up -d postgres
docker exec talla-postgres-1 psql -U postgres -d talla_dev -c 'CREATE DATABASE talla_test'
docker build -f workers/image/Dockerfile -t talla-image-worker:local .
TALLA_TEST_IMAGE_SANDBOX=1 TALLA_TEST_DATABASE_URL=postgresql://postgres:local-development-only@localhost:5432/talla_test   pnpm test
```

Three more gates need a browser and a running Talla (ADR-0023). They skip themselves
without one, so they need the stack up and the browser installed:

```
pnpm exec playwright-core install chromium chromium-headless-shell
cp .env.example .env && docker compose up -d --wait && docker compose run --rm seed
TALLA_GATE_URL=http://nasij.localhost:3000 pnpm gates
```

They measure the production images serving a seeded store, not a dev server, because a
dev server is a build no buyer ever receives.

Migrations are forward-only, and that is now enforced rather than agreed: the runner
records a checksum per applied migration, so editing one that has shipped stops the
deployment and names the file. Write a new migration instead.

If a gate blocks you and the gate is wrong, fix the gate in its own pull request. Never
add a skip.

## Definition of done

A change is done when:

- The gates pass.
- Docs that the change contradicts are updated in the same pull request.
- Any decision made along the way is either covered by an existing ADR or has a new one in
  `docs/decisions/`.
- For UI, the pre-flight check in [`docs/frontend/README.md`](docs/frontend/README.md) has
  been run, on the reference device, in both themes, and with reduced motion enabled.

## Reporting a security issue

Do not open a public issue. Contact the maintainers directly. See
[`docs/operations/security-checklist.md`](docs/operations/security-checklist.md) for the
controls this project commits to.
