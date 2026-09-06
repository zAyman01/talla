# 0017. Keep development references separate from release evidence

**Status:** Accepted
**Date:** 2026-09-07

## Context

Implementation is authorized for all phases, but the project has no store photographs,
authored garment blocks, or measured pilot results. The user authorized sourcing public
images for development tests. These inputs cannot establish physical color accuracy,
owner acceptance, or phone performance.

## Decision

Ship an Arabic development inspection harness with attributed public references. Keep it
explicitly separate from a completed buyer storefront. Its model-loading measurement is
not TTFD: no garment has been dressed. Phase 0 evaluation requires 50 real garments from
at least three stores, complete owner/color observations, typography review, and ten
physical reference-phone samples per cache mode. Ten samples is the repeatability
protocol; the spec's existing timing thresholds remain unchanged.

Use PGlite (PostgreSQL compiled to WASM) for fast policy/transaction tests, and PostgreSQL
16 in a disposable container for concurrent stock tests. The production adapter uses
`pg` and refuses superuser or BYPASSRLS connections. PGlite is not the production store.
Price/stock queries execute under a tenant transaction with SET LOCAL and an explicitly
unprivileged database role.

This is preparation for later phases, not permission to release before the earlier
phase's exit criteria pass. Trial evidence, production phone integration, trained/selected
segmentation, authored blocks, validated solves, and pilot-supported pricing remain
unfulfilled until supported by recorded evidence.

## Consequences

Developers can exercise meaningful behavior without inventing store approvals. The real
PostgreSQL test is required in CI; the PGlite test cannot substitute for concurrency.
Public reference assets add attribution obligations documented beside the assets and in
the inspection UI. The existing Next.js/PostgreSQL architecture is retained.
