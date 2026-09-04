# 0003. Body sizes ship as morph targets, not separate meshes

**Status:** Accepted
**Date:** 2026-09-04

## Context

The Dress Solver drapes each garment onto 5 sizes across 2 body types, so 10 solves per
garment, each at 2 layer depths. The obvious delivery format is 10 cached meshes, and that
is what the original spec implied.

Bandwidth, not compute or storage, is the cost driver for this product. Buyers are on 4G on
mid-range Android phones, and "choose your body size" is a core interaction that a buyer
will use several times per session.

## Decision

Ship one base mesh plus nine quantized morph-target deltas. The 10 solves still happen at
upload; only the packaging changes.

## Consequences

Wire cost for a garment's geometry drops from roughly 10 times a mesh to roughly 1.4 times
one. This is the largest single bandwidth saving available in the system, and bandwidth is
the line item that decides whether the unit economics work.

Changing body size in the viewer becomes a vertex blend with **no network request at all**,
which converts the product's most-used control from a several-hundred-kilobyte fetch into a
free, instantly animatable one. The interaction quality improvement is arguably worth more
than the bandwidth saving.

The Asset Pipeline gets more complex: it must compute deltas against the base, quantize
them without visible popping, and validate that the blend is correct at every intermediate
value. Morph target quantization artifacts are subtle and need a golden-image test.

This decision fixes the asset format, so changing it later means re-publishing every
garment in every catalog. It has to be made before Phase 1 ships, not after.
