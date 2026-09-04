# Architecture overview

Implementation companion to spec sections 5 and 6. The spec says what the system is; this
says how it is laid out on disk and what each boundary guarantees.

---

## Shape

A **modular monolith plus an asynchronous worker pool**. Not microservices. Two engineers
cannot carry the operational cost of service boundaries, and the module boundaries below
are compile-time boundaries that become extraction seams if one ever needs independent
scale. See [ADR-0001](../decisions/0001-modular-monolith.md).

## Repository layout

```
talla/
  apps/
    storefront/          buyer-facing. The only surface most people ever see.
    admin/               store owner. Different design track (see docs/frontend).
    marketing/           talla.app. Static, separate deploy, separate design dials.
  modules/
    ingest/              trust boundary. Untrusted input stops here.
    understanding/       segmentation, attributes, emits GarmentSpec
    blocks/              hand-authored parametric garment blocks, versioned
    solver/              drape simulation, produces meshes and settle clips
    assets/              LOD, morph packing, compression, budget gate, publish
    viewer/              browser 3D runtime and the device-tier ladder
    styling/             the ranker. A pure function.
    commerce/            catalog, cart, orders, COD
    tenancy/             tenant resolution, context, isolation
    shared/              genuinely shared code. Explicit, small, reviewed.
  workers/
    image/               SANDBOXED. Network isolated. Parses untrusted bytes.
    gpu/                 solver plus asset pipeline. Trusted input only.
  packages/
    garment-spec/        generated types from the JSON Schema. Never hand-edited.
    tokens/              design tokens, generated to CSS and to TS
  docs/
```

Each `modules/*` directory publishes one interface file. Everything else in it is
internal. This is enforced by an import-boundary linter in CI, not by discipline.

## Module contracts

| Module | Consumes | Produces | Guarantees to callers |
|---|---|---|---|
| `ingest` | raw uploads, store metadata | validated photo set | Everything downstream is well formed, re-encoded by us, and free of EXIF |
| `understanding` | validated photo set | `GarmentSpec`, texture assets | Every derived field carries a confidence value |
| `blocks` | nothing | block meshes, UV layouts, fabric presets | Immutable and versioned. A `block_version` never changes meaning |
| `solver` | `GarmentSpec`, block, body | draped meshes, settle clips | Deterministic for a given input triple |
| `assets` | solver output | published LOD chain, morph deltas, sprites | Nothing publishes over budget |
| `viewer` | published assets | rendered scene | Degrades by tier, never blanks |
| `styling` | specs, pins, stock | ranked suggestions | Pure. No I/O. Never suggests out-of-stock |
| `commerce` | catalog, cart input | orders | Price and stock are server authoritative |
| `tenancy` | request | tenant context | Context is set once per request, before any query |

## Data stores

| Store | Holds | Why |
|---|---|---|
| PostgreSQL | tenants, catalog, specs, stock, carts, orders, pins, audit log | Relational and transactional, and row-level security gives isolation the application layer cannot. [ADR-0002](../decisions/0002-postgres-rls-tenancy.md) |
| Object storage plus CDN | photos, meshes, textures, sprite sheets | Immutable, content addressed, cheap. The real cost centre |
| Durable job queue | ingest, understanding, solve, asset jobs | Jobs run for minutes and must survive a deploy. Postgres backed is sufficient here |
| Redis | rate limits, sessions, styling cache | Ephemeral only. Never the sole copy of anything |

## Request path

A buyer request is served from the CDN or, on a miss, by the web application under a
tenant context established before the first query. No buyer request triggers computation
beyond a database read and a ranking cache lookup.

An upload request enqueues a job and returns. The job chain is
`ingest, understanding, solve, assets, publish`, each stage idempotent and each emitting
its timing and cost to one trace per garment.

## Content addressing

Every published asset is named by the hash of its bytes plus the pipeline version. Assets
are immutable, cached for a year, and a re-solve produces a new URL. Cache invalidation
stops being something anyone has to think about. See
[ADR-0009](../decisions/0009-content-addressed-assets.md).

## Environments

`local` to `staging` to `production`. Staging carries one seeded fake tenant plus one
pilot tenant with buyer PII redacted. No developer runs against production data.

## Where the trust boundaries are

Three, and they are the only places where a mistake is not recoverable by a follow-up
commit:

1. **`workers/image`.** The only component that parses bytes chosen by someone outside the
   system. Assume it will eventually be compromised and give it nothing worth having.
2. **`modules/tenancy` plus RLS policies.** The line between one store's data and another's.
3. **`modules/commerce` order confirmation.** Where a client could otherwise choose a price.

Changes to any of the three require both engineers to review. See
[`CONTRIBUTING.md`](../../CONTRIBUTING.md).
