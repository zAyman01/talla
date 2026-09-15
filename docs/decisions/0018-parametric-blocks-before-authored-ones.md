# 0018. The Block Library ships parametric geometry until an artist authors blocks

**Status:** Accepted
**Date:** 2026-09-11

## Context

Spec section 5 describes the Block Library as "hand-authored parametric 3D garment blocks
and their UV layouts, authored by an artist rather than generated". There is no artist yet,
and there will not be one before the Phase 0 truth test is answered.

Meanwhile the storefront's entire job, per `docs/frontend/README.md`, is "dress the
mannequin, build an outfit, order". Until something wears something, there is no product to
look at and nothing to put in front of a store owner. The page was standing in a
lying-down CC0 human model on a development page and flat reference photographs on the
home page, which demonstrates neither dressing nor fit.

The two candidate stopgaps were a downloaded mannequin plus authored garment meshes, or
geometry computed from a size chart.

## Decision

`modules/blocks` ships a deterministic parametric mannequin and parametric garment blocks,
generated in TypeScript from a graded size chart, behind the same module interface the
authored library will use.

The figure is a faceless, full-height female retail form with a stable topology across six
sizes. Garments are the body plus an ease profile plus a hang rule, and every finished
girth is a known number, which is what the fit reading beside the viewer is computed from.
Cloth clearance is enforced per vertex rather than per girth.

The `BlockLibrary` interface for asset-backed authored blocks stays in place, unchanged and
unimplemented. This record is superseded when authored blocks land.

## Consequences

The viewer dresses a figure today, body size is a real morph target rather than a promise,
and "will it fit me" gets an answer in centimetres rather than a picture. Every one of
those is testable in Node in milliseconds, because the geometry is arithmetic over typed
arrays and carries no Three.js, no DOM, and no WebGL.

What this is not: a Dress Solver. Nothing is simulated, nothing converges, and the drape
settle is a blend from a lifted pose rather than the tail of a real solve. The quality
limits in spec section 8 apply with more force, not less: a gathered hem, a structured
shoulder, and a bias-cut drape are all out of reach. Output from this library must never be
presented to a store owner or a buyer as a solved garment, and it produces no Phase 0
evidence of any kind.

The size chart is a standard block grading, not a measurement of a population. It is a
plausible figure, not a true one, and it says nothing about whether the sizes an Egyptian
store actually sells match it. That question is answered with pilot stores, not with code.

Two numbers now exist for the same thing until the solver lands: this library's ease and a
future solve's ease. They will disagree. When the solver arrives, the fit reading moves to
it, and the gap between the two is worth measuring rather than hiding, because it is the
error a buyer would have been shown.
