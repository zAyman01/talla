# 0009. Content-addressed immutable assets, one-year cache

**Status:** Accepted
**Date:** 2026-09-04

## Context

Every garment publishes a set of meshes, morph deltas, textures, and sprite sheets. A
garment can be re-solved: a store corrects an attribute, a block gets a new version, the
pipeline improves.

CDN bandwidth is the cost driver for this product, so cache hit rate is a commercial
concern and not only a performance one. Cache invalidation across a CDN is also the classic
source of "the store owner sees the old version and thinks we are broken".

## Decision

Every published asset is named by the hash of its bytes plus the pipeline version. Assets
are immutable and served with a one-year cache header. A re-solve produces a new URL, and
the database row points at the new one.

## Consequences

Superseded versions stay in object storage until a garbage collection pass removes
unreferenced objects. Storage is the cheapest thing in this system, so this costs very
little, but it does need a periodic sweep or it grows forever.

Cache invalidation stops being something anyone has to think about. There is no purge step,
no stale-content class of bug, and no "did the CDN pick it up yet" during a demo. For a
two-person team, removing an entire category of operational problem is worth more than the
storage.

Deduplication comes free: two garments with identical textures publish one object.

A pipeline version change invalidates everything it touches, by design. Bumping it means
re-publishing, so it is a deliberate act rather than a side effect, and the per-SKU cost
metric will show exactly what it cost.
