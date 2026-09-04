# 0001. Modular monolith plus a worker pool, not microservices

**Status:** Accepted
**Date:** 2026-09-04

## Context

Talla has nine modules with genuinely different jobs, and two of them (the Dress Solver and
the Asset Pipeline) have a completely different resource profile from the web application:
minutes of GPU time per job, versus milliseconds of database time per request. That
difference is the standard argument for splitting services.

The team is two engineers, one of whom also owns sales.

## Decision

One deployable web application containing all request-serving modules, plus a separate
asynchronous worker pool for the image and GPU work. The nine modules are directories with
published interfaces, enforced by an import-boundary linter in CI.

Not microservices.

## Consequences

Service boundaries would cost more in operations, local development, and distributed
debugging than they return at this size. A two-person team that spends a day on a tracing
problem has lost a meaningful fraction of a sprint.

Scaling is coarse: the whole web application scales together even if only the catalog is
hot. Accepted, because the expensive work is already in the worker pool, which scales
independently and is where the actual load asymmetry lives.

If a module ever needs independent scaling, its published interface is the extraction seam
and the split is mechanical rather than archaeological. The linter is what keeps that true;
without it the boundaries erode within weeks and the option disappears.
