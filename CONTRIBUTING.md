# Contributing

Talla is at design stage. There is no application code yet. This document describes how
work will run once there is, and it is already binding on documentation changes.

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

| Gate | Fails when |
|---|---|
| Typecheck | Any type error |
| Lint and format | Any violation |
| Module boundaries | A module imports another module's internals |
| Unit and property tests | Any failure |
| `GarmentSpec` contract tests | Producer and consumer disagree on the schema |
| RLS isolation test | Any tenant-scoped table lacks a policy, or a cross-tenant row is returned |
| Secret scan | Any high severity finding |
| Dependency audit | A known vulnerability at high severity or above |
| Bundle size budget | The storefront critical path regresses past budget |
| Asset budget | The over-budget garment fixture publishes successfully |
| Golden image render | Perceptual difference beyond threshold on the reference garments |
| Lighthouse | Any budget in spec 11.1 missed on the throttled reference profile |

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
