# Decision records

With two people on this, the failure mode is not disagreement. It is two different
remembered versions of an agreement, three months later, with no way to tell which one was
real.

Every decision that a future contributor might reasonably want to reverse gets a record
here.

---

## Index

| ID | Decision | Status |
|---|---|---|
| [0001](0001-modular-monolith.md) | Modular monolith plus a worker pool, not microservices | Accepted |
| [0002](0002-postgres-rls-tenancy.md) | PostgreSQL row-level security as the isolation mechanism | Accepted |
| [0003](0003-morph-targets-for-body-sizes.md) | Body sizes ship as morph targets, not separate meshes | Accepted |
| [0004](0004-meshopt-over-draco.md) | meshopt over Draco for geometry compression | Accepted |
| [0005](0005-achromatic-palette-indigo-accent.md) | Achromatic interface, single indigo accent | Accepted |
| [0006](0006-arabic-first-typography.md) | Noto Naskh Arabic display, IBM Plex Sans Arabic UI | Accepted, revisit at the Phase 0 typography gate |
| [0007](0007-phone-otp-auth.md) | Phone OTP for store owner authentication | Accepted |
| [0008](0008-whatsapp-reference-not-payload.md) | WhatsApp handoff carries a reference, not order contents | Accepted |
| [0009](0009-content-addressed-assets.md) | Content-addressed immutable assets, one-year cache | Accepted |
| [0010](0010-tier-c-fallback-in-phase-1.md) | The tier C sprite fallback is built in Phase 1, not later | Accepted |
| [0011](0011-frontend-stack.md) | Next.js, Tailwind v4, Three.js, Motion for the frontend stack | Accepted |
| [0012](0012-reference-device.md) | The reference device is a Samsung Galaxy A16, 4 GB | Accepted |
| [0013](0013-hosting-region-eu-frankfurt.md) | The primary database is hosted in EU Frankfurt | Accepted |
| [0014](0014-margin-nudge-cap.md) | The margin nudge is a tiebreak only, capped at one rank | Accepted |
| [0015](0015-documentation-authority-and-contracts.md) | Documentation authority and executable contracts | Accepted |
| [0016](0016-repository-tooling.md) | pnpm workspaces, Vitest, ESLint flat config, dependency-cruiser | Accepted |

## Format

Keep them short. Four headings, and the last one is the one people actually come back for.

```markdown
# NNNN. Title

**Status:** Proposed | Accepted | Superseded by NNNN
**Date:** YYYY-MM-DD

## Context
What forced a decision.

## Decision
What was chosen.

## Consequences
What this costs, and what it now prevents or enables.
```

## Rules

- One decision per file. Numbered sequentially, never renumbered.
- **Never edit an accepted record to change its meaning.** Supersede it with a new one and
  mark the old one superseded. The history is the point.
- If you are about to deviate from an accepted record, either follow it or supersede it.
  Quiet deviation is how a codebase stops matching its own documentation.
- Write the consequences honestly, including the ones you dislike. A record that lists only
  benefits is marketing, and it will not help the person who has to reverse it.
