# Talla — Design Spec

**Date:** 2026-09-04 · **Revised:** 2026-09-04 (rev 2)
**Status:** Design approved in brainstorming. Not yet planned or built.
**Authors:** Mahmoud Ayman + partner

> **Rev 2 scope.** Rev 1 settled the business: who buys, why, what is sold, and in what
> order to build. That reasoning is intact. Rev 2 adds the engineering spine that was
> missing — security and privacy, an explicit performance architecture, module boundaries
> that a two-person team can hold, a design and motion system, and accessibility.
> Section 21 lists every place rev 2 contradicts rev 1 and why.

---

## Contents

1. [Summary](#1-summary)
2. [Problem and promise](#2-problem-and-promise)
3. [Target customer](#3-target-customer)
4. [Scope](#4-scope)
5. [Architecture — modules](#5-architecture--modules)
6. [Architecture — runtime and deployment](#6-architecture--runtime-and-deployment)
7. [The `GarmentSpec` contract](#7-the-garmentspec-contract)
8. [Pipeline](#8-pipeline)
9. [Color pipeline](#9-color-pipeline)
10. [Styling engine](#10-styling-engine)
11. [Performance architecture](#11-performance-architecture)
12. [Security and privacy](#12-security-and-privacy)
13. [Design system](#13-design-system)
14. [Motion system](#14-motion-system)
15. [Accessibility](#15-accessibility)
16. [Engineering standards](#16-engineering-standards)
17. [Instrumentation](#17-instrumentation)
18. [Business model](#18-business-model)
19. [Go to market](#19-go-to-market--first-ten-stores)
20. [Risks](#20-risks-ranked-by-probability-of-killing-the-project)
21. [What changed in rev 2](#21-what-changed-in-rev-2)
22. [Build order](#22-build-order)
23. [Team split](#23-team-split)
24. [Decision log](#24-decision-log)

---

## 1. Summary

Talla is a hosted storefront for small and medium clothing stores in MENA. A store
uploads photos of a garment; Talla turns it into a 3D garment worn by an on-page
mannequin. Buyers browse the catalog, dress the mannequin, build complete outfits,
and order.

The product sold to the store owner is **basket size**, not fit. A buyer who builds
an outfit buys three pieces instead of one.

**Name:** *Talla* — from Arabic طلّة, the look a person shows up in ("طلّتك حلوة").
Also *talla*, Spanish for clothing size, which pre-loads the name for the export
market. English line: *See the whole look.* Arabic line: *شوف طلّتك قبل ما تشتري.*

**Identity constraint that is also a product constraint:** the merchandise is the only
saturated color on the page. The interface is achromatic; a single accent carries
system meaning and appears nowhere near a garment. Section 13 makes this concrete and
corrects the "warm sand" direction from rev 1, which quietly worked against the goal.

---

## 2. Problem and promise

Small clothing stores in MENA sell mostly through Instagram and WhatsApp. Product
photos show one garment at a time on a hanger or a flat surface. Buyers cannot see
how pieces work together, so they buy one item per order.

Talla's promise to the store: **more items per order.** This is chosen over the two
obvious alternatives for concrete reasons.

- *Fit / fewer returns* requires personal body data to be truthful, and a wrong fit
  claim damages both the store and Talla. Deferred to a later stage.
- *Wow factor / looking modern* sells first deals easily but is a nice-to-have, so it
  churns as soon as budget tightens.

Basket size is measurable within a single pilot, carries no fit liability, and is not
served by the large try-on products, which target fit within their own catalogs.

**A constraint rev 1 left implicit:** buyers arrive from Instagram, which means they
arrive inside the Instagram in-app browser on a mid-range Android phone. That browser
is the primary runtime target, not desktop Chrome and not Safari. It shapes the whole
performance architecture in section 11.

---

## 3. Target customer

**First customers:** small-to-medium clothing stores in MENA, sold to in person.

Qualifying traits:

- 100–400 SKUs
- Sells both tops and bottoms — a single-category store (shoes only, bags only,
  abayas only) gives the styling engine nothing to work with and must not be pitched
- Existing Instagram following that already converts
- Owner is the decision maker

**Export path:** once pilot numbers exist, package the try-on as a widget for Shopify
and WooCommerce stores in Europe and the US. Not v1.

---

## 4. Scope

**In scope for v1 (storefront-lite):**

- Catalog with size and color variants, stock levels
- Store admin: upload garment, confirm attributes, set price and sizes
- Buyer catalog browse and filter
- Mannequin viewer: rotate, zoom, swap garments, layer, choose body size
- Outfit builder and "goes with" suggestions
- Cart, orders, cash-on-delivery
- WhatsApp order handoff
- Arabic and RTL, mobile-first
- Multi-tenant: one store, one subdomain, isolated data

**Explicitly out of scope for v1:**

- Multi-branch inventory
- Coupon and promotion engine
- Loyalty programs
- Product reviews
- Multi-currency
- A cross-store marketplace
- Analytics beyond the instrumentation described in section 17
- Buyer body scanning, selfies, or measurements

**In scope but not negotiable, added in rev 2.** These are not features and cannot be
traded against the scope freeze, because retrofitting any of them costs more than
building them:

- Tenant isolation enforced in the database, not the application (section 12.3)
- A sandboxed image-processing worker (section 12.2)
- The device-tier ladder and its 2D fallback (section 11.2)
- Buyer PII handling that satisfies Egypt's PDPL from the first real order (section 12.7)

**Scope freeze rule:** if a feature is not required to complete a cash-on-delivery
order, it is refused until stores are paying. Commerce depth is not the moat, and it
absorbs unlimited time. The four items above are exempt: they are not commerce depth,
they are the cost of operating at all.

---

## 5. Architecture — modules

Eight modules, each with one job and a defined interface.

| Module | Responsibility | Depends on |
|---|---|---|
| **Ingest** | Accept store photos plus metadata. Enforce the capture protocol. Reject bad input with a specific reason before it reaches anything downstream. Own the trust boundary: everything past Ingest may assume its input is well-formed and safe. | — |
| **Garment Understanding** | Segment the garment from background, classify category, extract texture and color, read attributes. Emits one `GarmentSpec` plus texture assets. | Ingest |
| **Block Library** | Hand-authored parametric 3D garment blocks, their UV layouts, and fabric presets. Static, versioned, authored by an artist rather than generated. | — |
| **Dress Solver** | Given a `GarmentSpec`, a block, and a body size, produce a draped mesh plus a baked settle clip. Runs at upload time only. | Understanding, Block Library |
| **Asset Pipeline** *(new in rev 2)* | Take solver output and produce what ships: LOD chain, morph-target packing, mesh and texture compression, size-budget enforcement, CDN publish. | Dress Solver |
| **Viewer** | Browser 3D. Load mannequin and cached assets, resolve layering, render, degrade by device tier. | Asset Pipeline output |
| **Styling Engine** | Rank which garments go together. Drives the "complete the look" surface. | `GarmentSpec`, Commerce (stock) |
| **Commerce** | Catalog, cart, orders, COD, store admin. | Tenancy |
| **Tenancy** | One store per tenant: subdomain, theme, isolated data, and the tenant context every query runs under. | — |

Rev 1 folded asset preparation into the Dress Solver. Splitting it out matters because
the solver's job is physical correctness and the pipeline's job is bytes on a wire —
different failure modes, different people, and the pipeline is where the entire
bandwidth budget of section 11 is actually enforced. It is the only place that can say
"this garment is over budget, do not publish it."

**Governing rule:** all expensive computation happens at upload, once per garment.
A buyer click only loads cached geometry. This is what makes the unit economics work
and what keeps the viewer fast.

**Boundary rule:** a module may import another module only through that module's
published interface — never its internals. This is enforced by a linter in CI
(section 16.4), not by discipline. With two people and no code review quorum, an
unenforced boundary is a boundary that will be gone in six weeks.

---

## 6. Architecture — runtime and deployment

**Shape: a modular monolith plus an asynchronous worker pool.** Not microservices.
With two engineers, service boundaries cost more in operations, local development, and
distributed debugging than they return. The module boundaries in section 5 are
compile-time boundaries; if one ever needs independent scaling, it can be extracted,
and the published interface is the extraction seam.

```
                 ┌──────────────────────────────────┐
   buyer  ──────▶│  CDN  (catalog pages, meshes,    │
 (Instagram      │        textures, sprite sheets)  │
  in-app         └───────────────┬──────────────────┘
  browser)                       │ miss
                                 ▼
                 ┌──────────────────────────────────┐
                 │  Web app  (modular monolith)     │
                 │  Tenancy · Commerce · Styling    │
                 │  Viewer delivery · Admin · Ingest│
                 └──────┬───────────────────┬───────┘
                        │                   │
                 enqueue│                   │ SQL, tenant-scoped
                        ▼                   ▼
                 ┌─────────────┐    ┌──────────────────┐
                 │ Job queue   │    │  PostgreSQL      │
                 │ (durable,   │    │  row-level       │
                 │ idempotent) │    │  security ON     │
                 └──────┬──────┘    └──────────────────┘
                        │
      ┌─────────────────┴────────────────────┐
      ▼                                      ▼
┌──────────────────┐              ┌──────────────────────┐
│ Image worker     │              │ GPU worker           │
│ SANDBOXED        │─ GarmentSpec▶│ Dress Solver +       │
│ no network egress│   + textures │ Asset Pipeline       │
│ untrusted input  │              │ trusted input only   │
└──────────────────┘              └──────────┬───────────┘
                                             │ publish
                                             ▼
                                    ┌──────────────────┐
                                    │ Object storage   │
                                    │ per-tenant prefix│
                                    └──────────────────┘
```

**Why the image worker is a separate, network-isolated process.** It is the only
component that parses bytes chosen by someone outside the system. Image decoders are
the classic remote-code-execution surface, and a store owner's account is not a high
trust boundary — it is a phone number that answered an OTP. Section 12.2 specifies it.

**Data stores.**

| Store | Holds | Why |
|---|---|---|
| PostgreSQL | tenants, catalog, `GarmentSpec` rows, stock, carts, orders, pins, audit log | Relational, transactional, and row-level security gives tenant isolation the app layer cannot. Default choice; nothing here argues for anything else. |
| Object storage + CDN | source photos, meshes, textures, sprite sheets | Immutable, content-addressed, cheap. The CDN is the product's real cost centre. |
| Durable job queue | ingest, understanding, solve, asset jobs | Jobs run for minutes and must survive a deploy. Postgres-backed queue is sufficient at this size; a dedicated broker is unnecessary complexity for one worker pool. |
| Redis | rate-limit counters, session store, styling-engine result cache | Ephemeral only. Nothing in Redis may be the sole copy of anything. |

**Content addressing.** Every published asset is named by the hash of its content plus
the pipeline version: `sha256(mesh_bytes)`. Immutable assets get a one-year cache
header, a re-solve produces a new URL, and cache invalidation stops being a problem
anyone has to think about. This is a small decision with a large downstream effect on
both CDN cost and correctness.

**Environments.** local → staging (one seeded fake tenant plus one real pilot's data
with buyer PII redacted) → production. No developer runs against production data.

---

## 7. The `GarmentSpec` contract

`GarmentSpec` is the seam of the whole system: Garment Understanding emits it, and
the Dress Solver, Asset Pipeline, Viewer, Styling Engine, and Commerce all consume it.
**It is frozen at the end of Phase 0 and changed only by explicit agreement between
both authors.** A stable contract is what lets two people work in parallel without
blocking.

Fields:

- `spec_version` — semver of the schema itself *(rev 2)*
- `id`, `tenant_id`, `source_photo_refs`
- `category` — enum matching a block in the Block Library
- `block_id`, `block_version`
- `fabric` — cotton jersey, denim, silk/viscose, wool, leather (store-selected)
- `attributes` — sleeve length, neckline, hem, closure, rise, leg shape
- `textures` — front, back, detail; UV-ready assets
- `color_profile` — capture illuminant, gray-card reference, working color space *(rev 2, see section 9)*
- `sizes_available`, per-size stock reference
- Style fields used by the Styling Engine:
  - `formality` — 1 (beachwear) to 5 (tailored)
  - `season` — hot / mild / cold / all
  - `dominant_colors` — 1–3 colors in CIELAB with weights
  - `pattern_busy` — 0.0 to 1.0
  - `volume` — slim / regular / oversized
  - `slot` — outer / top / bottom / shoes / bag / accessory
- `confidence` per derived field, and `confirmed_by_store` boolean

**How the contract is enforced, not just agreed** *(rev 2)*. "Frozen by agreement" is a
social control and will not survive a deadline. Add three mechanical ones:

1. The schema lives in one versioned file (JSON Schema), and every consumer's types are
   **generated** from it. A field cannot drift, because no one hand-writes the type.
2. Changes within a major version are **additive only**: new optional fields, never a
   removal, never a narrowing. A breaking change bumps `spec_version` major and requires
   a migration for stored specs.
3. Each consumer ships a **contract test** with a committed fixture set. Producer and
   consumer tests run in the same CI job, so a change that breaks a consumer fails the
   producer's pull request, not next month's viewer bug.

**Provenance.** Every derived field carries `confidence`, and `confirmed_by_store` marks
it as store-verified. Do not overwrite a store-confirmed field with a model output on
re-processing; a re-run inherits prior confirmations. Losing an owner's corrections is
the fastest way to make them stop correcting.

---

## 8. Pipeline

### Store side — once per garment, target under two minutes of the owner's time

1. **Shoot to protocol.** Front, back, and one three-quarter angle. Flat on a plain
   surface or on a form, **with the supplied gray card in frame** (section 9). The
   protocol is enforced, not suggested — inconsistent input is the primary cause of
   bad output.
2. **Enter metadata.** Fabric from a short dropdown, price, sizes, stock.
3. **Ingest validates.** Checks angle coverage, background plainness, sharpness, gray
   card presence, and whether the garment is fully in frame. Failures are specific and
   actionable ("back photo missing", "image too dark"), never generic errors. Every
   rejection carries a stable machine code plus Arabic and English text and a fix
   action (section 16.5).
4. **Understanding runs**, emitting a `GarmentSpec`.
5. **Store confirms.** A single screen: *"We read this as: relaxed crew-neck tee,
   short sleeve, cotton jersey. Correct?"* with dropdowns to correct any field.
   This screen is the quality insurance of the entire system — it converts model
   guesses into store-verified facts for about five seconds of the owner's time, and
   it removes the "it looks wrong and I cannot fix it" failure that would otherwise
   cause churn.
6. **Dress Solver drapes** the garment onto each preset body: 5 sizes × 2 body types
   = 10 solves, each at 2 layer depths. Then the **Asset Pipeline** packs them
   (section 11.3), enforces the size budget, and publishes. This runs in the background
   over minutes; the item goes live when it completes and passes budget.

### Buyer side — instant

Browse catalog → tap a garment → the mannequin wears it by loading a cached mesh, with
no computation → tap another top to swap → add a bottom to layer → rotate and zoom →
the Styling Engine's "goes with" strip sits below → the whole outfit adds to cart in
one tap.

### Layering

Outfit combinations are never simulated. Each garment is cached at two layer depths,
*base* and *over*. At render time the viewer sorts by depth and renders the outer shell
against the inflated body proxy it was solved against.

This keeps cost additive rather than multiplicative: N tops × M bottoms × K jackets
would be intractable to precompute and too slow to solve live.

**Correction to rev 1** *(rev 2)*. Rev 1 said the viewer "pushes the outer shell out
slightly along its normals" at render time. Uniform normal offset self-intersects wherever
the surface is concave — armholes, the waist under a belt, any gathered hem — and produces
exactly the uncanny spikes that kill trust in the render. Do it at solve time instead:
the *over* variant is solved against a body proxy inflated by the base layer's thickness
envelope. Cost is unchanged (the two depths were already being solved), the failure mode
disappears, and the viewer's job stays "sort and draw".

### Known quality limits

Output will be weakest on unusual silhouettes snapped to a nearest block, on very thin
fabrics close to the body, and on structured garments such as corsets and tailored
coats. A manual override path for these is a later, priced feature — not a v1 gap to
hide.

---

## 9. Color pipeline

*New in rev 2.* Rev 1 asserted that garment colors must read true and then specified no
mechanism for it. A maroon hoodie photographed under a shop's fluorescent tubes and one
photographed near a window are two different colors, and neither is the real one. Without
a reference, "reads true" is a hope. Colour error is also the single most likely reason a
buyer refuses a cash-on-delivery parcel at the door, which makes it a commerce problem,
not an aesthetic one.

The fix is cheap and physical:

1. **A gray card ships with the onboarding kit.** A neutral card in frame on every shot.
   It costs cents, and it is the same object that makes the shoot protocol teachable.
2. **Ingest requires and locates it.** No card, no ingest — a specific, fixable rejection.
3. **White balance and exposure are normalized to the card** before segmentation. Every
   downstream color decision then operates on comparable numbers.
4. **One working space, declared.** Textures authored and stored in sRGB; the renderer
   works in linear and tone-maps once at output. Mixing spaces silently is the usual
   cause of "the 3D looks washed out next to the photo".
5. **`color_profile` records what happened** — illuminant estimate, correction applied,
   residual confidence — so a wrong color is diagnosable rather than mysterious.
6. **The viewer stage is achromatic** (section 13). A warm background shifts perceived
   garment hue through simultaneous contrast; the eye judges color against its surround.
7. **Wide-gamut displays are handled explicitly.** Most mid-range Androids are sRGB, but
   flagship and iOS devices are Display P3, and an untagged sRGB texture rendered on a P3
   canvas is visibly over-saturated. Tag the canvas color space; do not let the browser
   guess.

Phase 0 gate addition: for the 50 test garments, measure ΔE between the physical garment
and the rendered mannequin. **Median ΔE00 under 3 is the target; over 5 is a fail** and
means the capture protocol, not the model, is the problem.

---

## 10. Styling engine

**Slot model.** An outfit is a fixed slot set: `outer, top, bottom, shoes, bag,
accessory`, one garment per slot. The slot model alone eliminates most nonsense
suggestions.

**Ranking, in order of authority:**

1. **Store pins.** A merchandiser marking "these go together" always ranks first. The
   store knows its customer better than the scoring function, and pinning gives the
   owner ownership of the tool, which is a retention lever.
2. **Stock filter.** Never suggest an item that is out of stock in the buyer's selected
   size. This is easy to forget and is the fastest way to look broken.
3. **Hard rules.** Slot conflicts, season mismatch, formality gap greater than 1.
4. **Soft score.** Color harmony in CIELAB (neutrals pair with anything; otherwise
   analogous or complementary), at most one busy pattern per outfit, and volume
   balance — an oversized top wants a slim bottom.
5. **Margin nudge.** A small tiebreak toward higher-margin or overstocked items. Kept
   small; buyers notice greed.

**Output:** top six suggestions, each with a one-line reason ("neutral base, one
statement piece"). The reason is functional, not decorative — it makes the output read
as styling rather than randomness, and it gives the store owner something to argue
with, which builds trust.

**Cold start is rules-only** and works on day one with no data. Later, learn from
co-purchase data and from mannequin sessions where an outfit was built but not bought
— that second signal is proprietary to Talla. Any learned layer sits on top of the
rules and never replaces them, so a bad model cannot produce a nonsense outfit.

**Implementation notes** *(rev 2)*:

- The ranker is a **pure function** of `(candidate specs, pins, stock snapshot, context)`.
  No I/O inside. This is what makes it property-testable: assert invariants like "a
  suggestion is never out of stock in the selected size", "never two items in one slot",
  "a pinned pair always outranks an unpinned pair" across generated catalogs, rather than
  hand-writing examples.
- Ranking runs server-side and its result is cached per `(garment, size, stock epoch)`.
  The stock epoch invalidates the cache on any stock change, which keeps rule 2 true
  without recomputing on every request.
- The margin nudge has a **hard cap** on how far it can move an item, recorded in the
  decision log. Left uncapped it will be raised under revenue pressure until the strip
  is visibly self-serving.

---

## 11. Performance architecture

The buyer is on a mid-range Android phone, on 4G, **inside the Instagram in-app browser**.
Budgets are verified on real inexpensive hardware from the first week; a development
laptop will not surface these problems.

### 11.1 Budgets

| Metric | Budget | Measured at |
|---|---|---|
| LCP (catalog page) | < 2.5 s | p75, reference device, 4G |
| **TTFD** — time to first garment dressed | < 4.0 s | p75, cold cache |
| TTFD, warm cache | < 800 ms | p75 |
| INP (tap to visible response) | < 200 ms | p75 |
| CLS | < 0.1 | p75 |
| Sustained frame rate while rotating | ≥ 30 fps, no frame > 50 ms | reference device |
| First-garment transfer | ≤ 1.2 MB | compressed, over the wire |
| Additional garment swap | ≤ 500 KB | compressed |
| GPU texture memory ceiling | ≤ 256 MB resident | hard cap, LRU evict |
| JS bundle, storefront critical path | ≤ 180 KB gzipped | excludes the 3D runtime, which is lazy |

Rev 1 used FID; INP replaced it as the responsiveness metric and is the one that actually
catches a janky garment swap. Rev 1 also had no memory ceiling — on low-end Android,
exceeding GPU memory does not degrade, it loses the WebGL context and the viewer goes
blank. That is a hard cap, not a target.

**Reference device.** One named, cheap, real Android phone, bought in week one and used
for every measurement — something in the ~$120 bracket with 4 GB RAM and a low-tier
Adreno/Mali GPU. Named in the decision log. Every budget above means "on that phone".

**Test matrix.** Every release is checked on: reference Android in Chrome, reference
Android in the **Instagram in-app WebView**, one iPhone in Safari, and one desktop
Chrome. The Instagram WebView is first-class, because that is where the traffic is; it
has its own memory limits, an unreliable WebGL context, and a habit of being killed and
restored mid-session.

### 11.2 Device-tier ladder

Not every phone that can open the store can run the 3D viewer, and the ones that cannot
are disproportionately the buyers this product exists for. Probe on load — renderer
string, `navigator.deviceMemory`, `hardwareConcurrency`, and a sub-200 ms micro-benchmark
— and pick a tier. The probe result is cached per device.

| Tier | Experience | Textures | Notes |
|---|---|---|---|
| **A** | Full 3D, soft shadow, 2048px textures, full LOD chain | KTX2 / UASTC | Recent mid-range and above |
| **B** | Full 3D, no shadow, 1024px textures, LOD1 as base | KTX2 / ETC1S | The common case |
| **C** | **Turntable fallback**: a pre-rendered 36-frame sprite sequence, drag to spin | WebP | Old devices, failed WebGL context, and a data-saver opt-in |

Tier C is not a consolation prize, and this is the important part: it is generated by the
same Asset Pipeline from the same solved meshes, it supports the same swap-and-layer
interactions, and it degrades the *rendering*, not the *product*. It is also the correct
answer when the Instagram WebView loses its WebGL context mid-session — fall back to C
rather than showing a blank canvas. Building tier C in Phase 1 rather than "later" is
what keeps it honest; retrofitted fallbacks are always worse.

### 11.3 Asset strategy — where the money is

Bandwidth is the cost driver, not compute or storage. Three decisions carry almost all of
the saving.

**1. Body sizes are morph targets, not separate meshes.** *(the largest single win)*
Rev 1 solved 10 bodies and implied 10 cached meshes. Ship instead one base mesh plus nine
**quantized morph-target deltas**. The solves still happen at upload — nothing about
quality changes — but the wire cost drops from ~10× a mesh to roughly 1.4×, and switching
body size in the viewer becomes a vertex-blend with **no network request at all**. Since
"choose your body size" is a core interaction, this converts the product's most-used
control from a several-hundred-kilobyte fetch into a free one.

**2. meshopt, not Draco.** Draco compresses slightly better but decodes several times
slower, single-threaded, on exactly the low-end CPUs this product targets — and that
decode lands directly in TTFD. meshoptimizer decodes fast enough to be invisible, and it
composes with LOD generation and with morph-target compression. Rev 1 named them as
interchangeable; they are not, for this device class.

**3. GPU-native textures.** KTX2 with Basis (UASTC on tier A, ETC1S on B/C). PNG and JPEG
must be decoded and then uploaded uncompressed, which is both a main-thread stall and a
multiple of the memory ceiling. Never ship a PNG as a GPU texture.

Supporting rules:

- **LOD chain per garment**: LOD0 detail, LOD1 default, LOD2 for the "goes with" strip and
  catalog thumbnails. Never load LOD0 before the user zooms.
- **Progressive dress**: show the mannequin with LOD2 within the TTFD budget, then swap up.
  Perceived speed beats actual speed, and the swap is invisible at thumbnail scale.
- **Prefetch exactly one thing**: the top "goes with" suggestion, at LOD2, on idle. Not
  the whole strip — that is how a store's CDN bill triples for no conversion gain.
- **Budget enforcement is a publish gate.** A garment whose packed assets exceed budget
  does not go live; it goes back with a specific reason. A budget nobody enforces is a
  comment.
- **Per-SKU cost is a tracked metric**, emitted by the Asset Pipeline: bytes published,
  solve seconds, GPU cost. Unit economics stay true only if they are measured per SKU
  rather than estimated once in a spec.

### 11.4 Runtime rules

- Decode meshes and textures in a **worker**, never on the main thread.
- One WebGL context for the whole session; **handle `webglcontextlost`** and recover to
  tier C rather than dying.
- Cap device pixel ratio at 2 — rendering a 3× buffer on a mid-range GPU costs more than
  it shows.
- Render on demand. A static mannequin renders zero frames; only interaction and the
  settle animation drive the loop. Continuous `requestAnimationFrame` on a still scene is
  a battery and thermal problem, and a thermally throttled phone breaks the 30 fps budget
  five minutes into a session.
- Virtualize the catalog grid past 50 items.
- Images: WebP/AVIF, explicit dimensions or `aspect-ratio` on every one, lazy below the
  fold.
- `font-display: swap`, preload only the Arabic UI face's regular and medium weights.

---

## 12. Security and privacy

*New in rev 2.* Rev 1 contained no security content and rated legal exposure "currently
low". Both are corrected here. The system takes untrusted files from semi-trusted
accounts, holds several stores' commercial data in one database, and collects buyer name,
phone, and home address from the first cash-on-delivery order.

### 12.1 Threat model summary (STRIDE)

Applied per element of the data-flow diagram in section 6. The rows that scored highest
on damage × exploitability, each with a named mitigation:

| # | Element | STRIDE | Threat | Mitigation | Section |
|---|---|---|---|---|---|
| 1 | Image worker | **E**levation | Malicious image exploits a decoder and executes code on a worker holding storage credentials | Sandboxed, network-isolated, least-privilege worker; canonical re-encode | 12.2 |
| 2 | Database | **I**nfo disclosure | Tenant A reads tenant B's catalog, orders, or margins through a missing `WHERE tenant_id` | Postgres row-level security, deny by default, CI test | 12.3 |
| 3 | Session cookie | **S**poofing | A cookie scoped to the parent domain lets any tenant subdomain read another's session | Host-only cookies; admin on a single non-tenant origin | 12.4 |
| 4 | Order flow | **T**ampering | Fake COD orders burn the store's real delivery cost and destroy trust in Talla | Phone OTP above a value threshold, rate limits, velocity rules | 12.5 |
| 5 | Storefront | **D**enial of service | Catalog and mesh endpoints scraped or flooded, CDN bill spikes | Rate limits, bot rules, per-tenant bandwidth alarm | 12.6 |
| 6 | Buyer PII | **I**nfo disclosure | Name, phone, address exposed or over-shared to third parties | Encryption, minimization, retention, WhatsApp handoff carries a reference not a payload | 12.7 |
| 7 | Admin actions | **R**epudiation | "I never changed that price / that stock level" during a pilot dispute | Append-only audit log on price, stock, and order state | 12.8 |
| 8 | Object storage | **I**nfo disclosure | An unlisted-but-public URL exposes a store's unreleased collection | Per-tenant prefixes, signed short-lived URLs for anything pre-publication | 12.3 |

Everything at or above this line has an owner before the design ships. Re-run the model
whenever a new external interface is added — payments, the Shopify widget, and buyer
selfies each change it materially.

### 12.2 The upload trust boundary

The image worker is the highest-value target in the system and is treated as if it will
eventually be compromised.

- **Isolation**: separate process, its own container, **no network egress**, read-only
  filesystem apart from one scratch mount, seccomp profile, non-root, dropped
  capabilities, hard CPU/memory/time limits. It receives a file and returns a result; it
  cannot call storage or the database directly.
- **Input policy**: an allowlist of `image/jpeg`, `image/png`, `image/webp` verified by
  **content sniffing, never by extension or client-supplied MIME type**. Explicitly
  rejected: SVG (it is a script container), TIFF, HEIC-with-embedded-payload, and any
  archive.
- **Decompression bombs**: cap decoded pixel count and decoded byte size before decoding,
  not after. A 40 KB PNG can decode to gigabytes.
- **Canonical re-encode**: the first operation is a decode-and-re-encode to a canonical
  format at a bounded resolution. Everything downstream sees only bytes Talla itself
  wrote. This single step neutralizes most polyglot and embedded-payload attacks.
- **EXIF is stripped**, and this is a privacy control as much as a security one: phone
  cameras write GPS into product photos, and a small store's product photo is very often
  taken at the owner's home. Publishing that coordinate would be a serious harm caused
  entirely by inattention.
- **No shell-outs with user-influenced arguments.** Use a library binding. Never construct
  a command line containing a filename that came from outside.
- **Filenames from users are never used as paths.** Store by generated ID; keep the
  original name as an untrusted display string only.

### 12.3 Tenant isolation

Tenant isolation is enforced in **PostgreSQL row-level security**, not in application
query code.

- Every tenant-scoped table carries `tenant_id NOT NULL` and an RLS policy comparing it to
  a session setting (`app.current_tenant`) established once per request in one place.
- Policies are **deny by default**; a table with RLS enabled and no policy returns nothing.
- The application connects as a role that **cannot bypass RLS**. Migrations use a separate
  privileged role.
- **A CI test enumerates every table and fails the build if any lacks RLS**, so a table
  added in a hurry cannot silently become the leak.
- A second test runs a representative query set as tenant A while tenant B's data exists,
  and asserts zero cross-tenant rows.

An application-layer `WHERE tenant_id = ?` is correct until the one query that forgets it,
and that query is written at 1 a.m. before a pilot demo. The database has to be the one
saying no. This is also the difference between "a bug" and "a breach we must notify three
stores about".

Object storage mirrors this: per-tenant key prefixes, bucket policies scoped to the
prefix, and signed short-lived URLs for anything not yet published. Published catalog
assets are public by design; nothing else shares their bucket.

### 12.4 Authentication and sessions

- **Store owners: phone OTP.** It matches how these owners already work, and it avoids a
  password that will be `123456` or reused from their Instagram. If passwords are ever
  added: Argon2id, and never as the only factor for admin.
- **Rate-limit OTP** by phone and by IP, expire codes in five minutes, cap attempts,
  and never reveal whether a number is registered.
- **Cookies**: `HttpOnly`, `Secure`, `SameSite=Lax`, and **host-only — never scoped to the
  parent domain**. On a multi-tenant subdomain product, a cookie on `.talla.app` is
  readable by every tenant subdomain, which converts one hostile or compromised store into
  a full compromise of all of them. Admin lives on a single dedicated origin rather than
  per-tenant subdomains, which removes the class of bug entirely.
- Session fixation: rotate the session ID on privilege change. Idle timeout on admin.
- Any tenant-supplied theming is a fixed set of tokens, **never raw CSS or HTML**. A store
  that can inject markup into its own storefront can phish its own buyers, and Talla is
  the one holding the certificate.

### 12.5 Commerce integrity

Cash on delivery means a fake order costs the store a real courier trip. Stores will
attribute that cost to Talla.

- Phone OTP verification before confirming an order above a configurable value.
- Velocity limits per phone, per device, and per address.
- Server-side price and stock authority: the client never sends a price, and the order
  total is recomputed at submission. Client-supplied totals are the oldest e-commerce bug
  there is.
- Stock is decremented in a transaction with the order; oversell is a stock-out at the
  door and a refused parcel.
- A store-visible block list, and a per-tenant cap on unverified order value per day.

### 12.6 Availability and abuse

- **TLS everywhere, no plaintext, plus HSTS with preload.** Buyers are on public and café
  wi-fi across the target market, and an order flow carrying a home address over a
  downgradeable connection is the cheapest possible interception.
- Rate limits on catalog, search, styling, and asset endpoints, per IP and per tenant.
- **DDoS protection at the CDN edge**, with rate limiting at the edge rather than at the
  origin. A volumetric attack on a storefront is also a direct bandwidth bill.
- Bot rules on the admin origin.
- **Per-tenant bandwidth alarm.** A scraped catalog is a CDN bill, and the first sign is
  usually the invoice. Alarm on anomaly, not at month end.
- Mesh assets are downloadable by anyone who can view the store. This is accepted, not
  fought: DRM on WebGL assets does not work. The public LOD is a reduced-detail mesh, the
  full-detail source stays private, and the moat is the pipeline and the commerce work,
  not the individual mesh.

### 12.7 Privacy and applicable law

**Rev 1's risk 8 is wrong and is corrected here.** It reasoned that a generic mannequin
means no biometric data and therefore low legal exposure. The absence of biometrics is
true and does remove the hardest category. But from the first cash-on-delivery order Talla
processes a buyer's **name, phone number, and home address** — personal data under every
regime in the target market. The obligations attach on day one, not at stage two.

- **Egypt: Personal Data Protection Law 151/2020.** Lawful basis and consent, purpose
  limitation, data-subject rights, breach notification, restrictions on cross-border
  transfer, and licensing/registration duties for controllers and processors. Talla is a
  processor for the store and a controller for its own account data; **that split must be
  written into the store contract**, because otherwise the store assumes Talla carries all
  of it and Talla assumes the store does.
- **Saudi Arabia PDPL** and **UAE Federal Decree-Law 45/2021** apply as the export path
  opens. Design once for the strictest.
- **Data residency**: prefer a MENA or EU region for the primary database. Cross-border
  transfer is the provision most likely to be enforced, and choosing the region on day one
  costs nothing while migrating later costs a quarter.

Practical controls:

- **Minimize**: collect what a courier needs and nothing more. No date of birth, no
  gender, no persistent buyer profile in v1.
- **Encrypt** at rest and in transit; buyer contact fields encrypted at column level so
  that a leaked backup is not a leaked address book.
- **Retention**: buyer PII is deleted or anonymized on a schedule after fulfilment;
  analytics keeps aggregates, never raw addresses. Define the window before the first
  pilot, not after.
- **Deletion and export** paths exist from v1, even if a support-operated script. They are
  a legal requirement and they are trivial early and painful late.
- **The holdout experiment** (section 17) uses a device-scoped pseudonymous identifier, not
  a buyer identity.
- **WhatsApp handoff sends a reference and a link, not the order contents.** Pushing full
  name, address, and basket into a third-party message thread is an unnecessary disclosure
  and an unnecessary processor relationship.
- **A privacy notice in Arabic**, written for a real buyer, before the first live store.

### 12.8 Operations

- **Secrets**: none in the repository, ever. A secret scanner runs in CI and blocks merge
  on any high-severity finding; a leaked credential is rotated, not deleted from history
  and forgotten.
- **Audit log**: append-only, tenant-scoped, covering price changes, stock changes, order
  state transitions, and admin logins. This is a repudiation control, and during a pilot
  dispute it is also the thing that settles the argument.
- **Dependencies**: lockfiles committed, automated vulnerability alerts, CI actions pinned
  by commit SHA, an SBOM per release. The supply chain is the realistic path into a small
  team's infrastructure.
- **Backups** are encrypted and **restore-tested**, on a schedule. An untested backup is a
  belief.
- **Least privilege** on every credential: the web app cannot write to the published-asset
  bucket, the image worker cannot reach the database, the GPU worker cannot read buyer PII.
- A written incident path: who is called, what is disclosed, and the 72-hour notification
  clock. Two people need this more than fifty do, because there is no one else to improvise.

---

## 13. Design system

*New in rev 2.* Rev 1 stated an identity constraint — warm stone and sand neutrals, single
accent — but no tokens, and the direction as stated works against its own goal.

**Two corrections, and the reasoning matters more than the hex values.**

*Warm neutrals bias the merchandise.* Perceived color is judged against its surround.
A sand-toned stage pushes a garment's apparent hue cooler and mutes warm reds — the exact
error that gets a parcel refused at the door. Retouchers judge color against neutral gray
for this reason. So: **the viewer stage is achromatic**, and warmth, where it appears at
all, lives in marketing surfaces that never sit beside a garment.

*The stated palette is also the current generic default.* Warm cream ground plus a
terracotta accent is what every AI-assisted design produces right now, and rust and clay
are common garment colors, so the accent would collide with the merchandise as well as
with everyone else's homepage. Talla's boldness is spent on **typography**, not color —
which is both more distinctive and, for a product whose entire promise is honest color,
more defensible.

### 13.1 Color tokens

Achromatic ground and ink; one accent, used for system meaning only.

```
--paper        #FAFAF9   page ground, near-neutral
--surface      #FFFFFF   cards, sheets
--stage        #E7E7E5   viewer backdrop — neutral by intent, never tinted
--line         #D9D9D7   hairlines, dividers
--ink          #16181A   primary text, cool near-black (not #000, not warm #111)
--ink-muted    #6E7276   secondary text — 4.6:1 on --paper
--accent       #26356B   indigo. CTA, active nav, focus ring. Nothing else.
--accent-press #1B274F
--success      #2F6B4F
--danger       #9B2C2C
--warning      #8A6114
```

Indigo is the accent because it is a real textile referent in the region — indigo dyeing
has a long history across North Africa and the Levant — so it reads as considered rather
than arbitrary, and because a deep desaturated blue almost never competes with the
garments in a store's catalog the way a rust or clay accent would.

Dark mode is designed as its own palette, not an inversion, and the **stage stays neutral
in both** — an accurate stage matters more than a consistent one.

Rules: semantic tokens only in components, never raw hex. Accent appears at most twice per
screen. Anything within 200 px of a garment is achromatic.

### 13.2 Typography

Arabic-first, because the primary market reads Arabic and Arabic-second design is visible
immediately to anyone who does.

| Role | Face | Notes |
|---|---|---|
| Display / wordmark, Arabic | **Noto Naskh Arabic** | High-contrast naskh, for the wordmark, hero, and marketing surfaces only. Never inside the storefront UI. |
| UI and body, Arabic | **IBM Plex Sans Arabic** | Variable, open source, genuinely engineered for Arabic rather than a Latin face with Arabic bolted on |
| UI and body, Latin | **IBM Plex Sans** | Same superfamily as the UI Arabic — metrics and voice match, so a mixed-script line does not look broken |

**The naskh display face is the deliberate move.** Every competing MENA storefront is set
in Cairo or Tajawal, and a naskh display reads as tailoring and heritage rather than as
another tech product — which is the position Talla wants, and it is where the design spends
its boldness instead of on color.

Two trade-offs are accepted knowingly. **Naskh over Amiri**: Amiri is the more characterful
naskh, but it carries a devotional association that a fashion brand does not want to
inherit; Noto Naskh keeps the calligraphic structure without it. **Crossing superfamilies**:
display and body come from different families, so their metrics do not harmonize — which is
acceptable only because the display face never shares a line with body text. If a Phase 0
review finds the pairing incoherent, the harmonized fallback is Noto Sans Arabic for body,
trading some UI character for metric unity. Judge all three against real garment photography
with real Arabic copy at the Phase 0 typography gate (§22) and record the outcome in ADR-006.

**Scale** — 1.2 ratio, base 16 px, never below 14 px for Arabic body text. Arabic loses
legibility at small sizes faster than Latin, and shrinking it to fit is the most common
Arabic typography failure.

```
12 · 14 · 16 (base) · 19 · 23 · 28 · 33 · 40
```

- Line height **1.7 for Arabic** body, 1.55 for Latin. Arabic needs the vertical room for
  ascenders, descenders, and diacritics.
- Measure 40–55 characters on mobile (Arabic words are shorter), 60–75 on desktop.
- Weight carries hierarchy: 600 headings, 500 labels, 400 body.
- **Prices use tabular figures** so a grid of prices does not shimmer as it re-renders.
- **Western Arabic digits (1234) for prices and quantities.** That is what Egyptian and
  Gulf storefronts use and what buyers scan fastest. Eastern digits are available per
  locale but are not the default.
- No all-caps labels: Arabic has no case, so a Latin all-caps label sitting next to Arabic
  is a visible tell that the design was made in English first.

### 13.3 Layout, spacing, RTL

4 px base, 8 px rhythm: `4 8 12 16 24 32 48 64 96`. Radii: `0 / 6 / 12 / 20 / full`, one
per hierarchy level, not one value on everything.

Breakpoints `375 / 768 / 1024 / 1440`, mobile-first. Content max-width 1200 px.
`min-h-dvh`, never `100vh`. Safe-area insets on the fixed header and the bottom cart bar,
which also need to clear the Instagram browser's own chrome.

**RTL is built with CSS logical properties throughout** — `margin-inline-start`,
`padding-block`, `inset-inline-end`. Not a mirrored stylesheet, and not `[dir=rtl]`
overrides, which double the surface for every future layout bug.

What mirrors and what does not — getting this wrong is the most common RTL error:

| Mirrors | Does not mirror |
|---|---|
| Page layout, navigation, chevrons, back arrows | **The 3D scene and the mannequin** — a garment is a physical object, and a mirrored garment is a wrong garment |
| Progress bars, sliders, carousel direction | Rotation gestures — drag left still spins left |
| Text alignment, list markers | Play/pause and media transport icons |
| Icons that indicate direction | Logos, photography, numerals in prices |

### 13.4 Component notes

- **One primary action per screen.** In the viewer that is "Add outfit to cart", carried in
  a **sticky bottom bar** that stays reachable while the buyer rotates and swaps — the
  configurator pattern's single highest-leverage placement, and the reason the viewer must
  reserve safe-area padding below it.
- Touch targets **≥ 44 px** with 8 px separation; expand hit areas rather than growing
  icons.
- Icons from one set, one stroke weight (Lucide or equivalent). **No emoji as icons** —
  they render differently per platform and cannot be themed.
- Skeletons, not spinners, for anything over 300 ms. The catalog card skeleton reserves
  the exact final aspect ratio so nothing shifts.
- Empty states say what to do next. A store with no garments yet sees "Add your first
  piece", not "No results".
- Prices are never truncated, never ellipsized.
- Errors state cause and recovery in the interface's voice: "Back photo missing. Add a
  photo of the back and upload again." Never "Invalid input", never an apology.

---

## 14. Motion system

*New in rev 2.* Motion has one job here: to make cloth feel like cloth. Everything else is
quiet, because a storefront whose every card slides and fades reads as a template and
distracts from the merchandise.

### 14.1 Tokens

```
--dur-press     90ms    press feedback
--dur-fast     160ms    state change, toggle, chip
--dur-enter    240ms    element enter
--dur-exit     160ms    element exit  (~65% of enter — exits feel sluggish at parity)
--dur-sheet    320ms    sheet, modal, drawer
--dur-drape    380ms    the garment settle (section 14.2)

--ease-enter   cubic-bezier(0.16, 1, 0.30, 1)    decelerate
--ease-exit    cubic-bezier(0.40, 0, 1, 1)       accelerate
--ease-move    cubic-bezier(0.65, 0, 0.35, 1)    in-place movement
```

Transform and opacity only. Never animate `width`, `height`, `top`, or `left` — they force
layout and are the direct cause of the frame drops the section 11 budget forbids.

### 14.2 The one orchestrated moment: the drape settle

When a buyer taps a garment, the mannequin does not cross-fade and the mesh does not pop.
The garment **falls onto the body and settles**, over ~380 ms.

This is nearly free, and that is what makes it the right bold choice. The Dress Solver
already simulates the cloth falling to rest; it currently discards everything but the final
frame. Keep **the last 12 frames as quantized vertex deltas** — a few kilobytes alongside a
mesh that is hundreds — and play them on load. The result is a swap that reads as fabric
landing rather than a texture change, produced by physics the pipeline already ran, and it
is not something a competitor gets by adding an animation library.

Rules: the settle is **interruptible** — tapping another garment mid-settle cancels
immediately and starts the next one; the viewer stays interactive throughout; the mannequin
itself never animates, only the cloth.

### 14.3 Everything else, kept quiet

| Surface | Motion |
|---|---|
| Catalog grid entrance | 40 ms stagger, opacity and 8 px rise, once per page — not on scroll |
| Garment card press | scale 0.98, `--dur-press` |
| "Goes with" strip | slides in from the inline-end after the settle resolves, `--dur-enter` |
| Add to cart | cart count ticks; a brief check on the button. No flying item |
| Sheets and modals | rise from the trigger's position, scrim to 50%, `--dur-sheet` |
| Page transitions | forward slides toward the inline-start, back the reverse — **direction follows reading order and flips under RTL**. The transition never waits on a data fetch: it has a max-wait timeout and hands off to a skeleton, or one slow request stalls the whole navigation |
| Size change | vertex-blend across the morph target, 200 ms. This is why morph targets are the right delivery format twice over: it is a smooth animation instead of a network fetch |
| Loading | skeleton at 300 ms, never a spinner over content |

### 14.4 Reduced motion

`prefers-reduced-motion: reduce` is respected everywhere and tested, not assumed:

- The drape settle jumps to the final pose. **The garment still appears** — reduced motion
  removes movement, never information.
- Stagger, slide, and scale are removed; a 60 ms opacity change remains so state changes
  stay legible.
- Parallax and any ambient motion are off entirely.

---

## 15. Accessibility

*New in rev 2.* Target WCAG 2.2 AA. This is a storefront, and an inaccessible one silently
loses the store money it never learns about.

- **Contrast**: 4.5:1 body, 3:1 large text and meaningful icons. Verified in both themes
  independently; the accent is checked against `--paper` and `--surface` as a CTA fill.
- **Focus**: a visible 2 px `--accent` ring with an offset, on everything interactive.
  Never removed.
- **Keyboard**: the entire purchase path works without a pointer. The 3D viewer exposes
  keyboard rotate and size controls, because a canvas is otherwise a dead zone.
- **Screen readers**: every garment has a text description built from its `GarmentSpec` —
  category, color name, sleeve, fit — so the canvas is not a hole in the page. Prices and
  stock are read as text, never as an image.
- **Never color alone**: out-of-stock carries a label, not just a gray wash. Errors carry
  an icon and text.
- **Forms**: visible labels, never placeholder-only; validate on blur; error below the
  field with `role="alert"`; focus moves to the first invalid field on submit.
- **Dynamic Type / text scaling to 200%** without clipping or overlap. Arabic at large
  sizes is the case most likely to break a layout; test it deliberately.
- **Zoom is never disabled.** `maximum-scale=1` is a common and inexcusable line.
- **Language and direction** are declared correctly per element for mixed Arabic/Latin
  content, so a screen reader does not read Arabic in an English voice.
- **Touch targets ≥ 44 px**, 8 px apart, and clear of the notch and the home indicator.

---

## 16. Engineering standards

*New in rev 2.* Two people, no review quorum, and a deadline. Standards therefore have to
be **mechanical** — enforced by CI — because anything enforced by intention will be traded
away in week six.

### 16.1 Language and types

One language across the storefront, admin, and API to keep two people fungible;
strict typing on, `any` requires a comment naming the reason. `GarmentSpec` types are
generated from the schema and never hand-edited. The GPU and image workers may be a
different language where the library ecosystem demands it — that is a real reason, unlike
preference.

### 16.2 Module boundaries

The eight modules of section 5 are directories with published interfaces. Cross-module
imports of internals are **blocked by an import-boundary linter in CI**, not by review.
Shared code lives in an explicit `shared` module; "utils" is not a module and is not
allowed to become one, because it is where boundaries go to die.

### 16.3 Testing — proportionate, not exhaustive

Coverage percentage is not a target. These five, chosen because each catches a class of
failure nothing else can:

1. **Contract tests on `GarmentSpec`** — producer and consumer, in one CI job, against
   committed fixtures.
2. **Golden-image tests on the renderer.** A perceptual diff of the reference mannequin
   wearing reference garments, at fixed camera and lighting. This is the only thing that
   catches "the render got subtly worse", which is the regression that actually loses
   customers and which no unit test will ever see.
3. **Property tests on the styling ranker** — the invariants in section 10, over generated
   catalogs.
4. **Isolation tests** — the RLS suite in section 12.3, non-negotiable.
5. **One end-to-end path** — upload → confirm → solve → live → dress → outfit → COD order.
   One, kept fast and kept green. A broad flaky E2E suite gets muted, and a muted suite is
   worse than none.

### 16.4 CI gates

Every gate blocks merge. A gate that warns is a gate that is ignored.

- Typecheck, lint, format
- **Module boundary check**
- Unit, contract, and property tests
- **RLS isolation test**
- **Secret scan** — blocks on high severity
- Dependency vulnerability scan
- **Bundle size budget** — section 11.1, fails on regression
- **Asset budget** — an over-budget garment fixture must fail the pipeline
- Lighthouse on the storefront, throttled to the reference profile

### 16.5 Errors and observability

- **A single error taxonomy.** Every failure has a stable code, an Arabic message, an
  English message, and a fix action. Ingest rejections are the visible face of this and are
  most of the store's experience of Talla's quality.
- **Structured logs** with `tenant_id`, `garment_id`, and a trace ID on every line. Never
  log buyer PII, ever, including in error payloads — leaked PII in logs is the most common
  way a careful team still has a breach.
- **One trace per garment job**, upload to publish, with per-stage timing and cost.
- **Alerts that matter**: job failure rate, p95 TTFD on the reference profile, per-tenant
  bandwidth anomaly, order failure rate, queue depth. Nothing else pages anyone.
- **A per-SKU cost metric** emitted on every publish, so section 18's unit economics stay
  measured rather than assumed.

### 16.6 Conventions

- Trunk-based, short-lived branches, squash merge. Long branches between two people
  produce conflicts neither has context to resolve.
- Conventional commits; the changelog is generated.
- Migrations are forward-only and reversible-by-compensation; never edit a shipped
  migration.
- Feature flags for anything half-built, with a removal date in the code. A flag without a
  removal date is permanent branching.
- **Decisions go in section 24 as ADRs.** With two people the risk is not disagreement, it
  is two different remembered versions of an agreement three months later.

---

## 17. Instrumentation

The promise is "sell more per order," so proving it is a v1 requirement rather than a
later addition.

A slice of visitors is held out from the mannequin experience. Talla compares items
per order and average order value between the held-out slice and the rest. Without
this measurement, Talla is selling a wow factor at a wow-factor price and will churn
around month three.

**Making the number defensible** *(rev 2)*. A pilot store may produce only a few hundred
orders in 60 days, and a noisy A/B result is worse than none — it will be argued away by
the first skeptical prospect.

- **Primary metric: items per order.** It moves more than average order value and needs a
  smaller sample. AOV is secondary; conversion rate is a guardrail, watched for harm rather
  than expected to improve.
- **Assignment is sticky per device**, hashed and pseudonymous, so the same buyer never
  sees both experiences across sessions. Non-sticky assignment contaminates the comparison
  and is the usual reason small experiments read as noise.
- **Compute the required sample before the pilot starts**, from the store's historical
  order volume. If 60 days cannot reach it, say so in advance and pool across pilot stores
  rather than discovering it at the end.
- **Hold out 20%**, not 50%. The store is giving up sales to be measured, and the
  asymmetric split still detects the effect size that matters.
- **Pre-register the analysis** — metric, window, and stopping rule — before data arrives.
  Choosing the cut after seeing the numbers is how a pilot produces a figure that does not
  survive the second store.
- **Report the confidence interval, not the point estimate.** "+0.4 items per order,
  95% CI [0.1, 0.7]" is a sellable, honest claim. "+31%" without an interval is the claim
  that gets challenged in the room and cannot be defended.
- Instrumentation is **pseudonymous and covered by the privacy notice** (section 12.7).

---

## 18. Business model

**Commission is rejected for v1.** Cash-on-delivery means the money never passes
through Talla. Taking a percentage would mean invoicing stores for cash they already
collected, creating reconciliation disputes and collections work.

**Model: subscription plus SKU credits.**

| | Starter | Growth |
|---|---|---|
| Monthly | ~EGP 3,000 | ~EGP 8,000 |
| SKUs digitized | 150 | 600 |
| Additional | packs of 50 | packs of 100 |

These figures are a starting hypothesis to be tested in pilots, not a finding. Pricing
anchor to test with owners: ask what one extra sale per day is worth to them, and
price below it.

An optional setup fee covers shoot-assistance for a store's first 100 items. Whether
or not it is charged, Talla does the early shooting itself: store photo quality is the
largest quality risk, and the capture protocol is learned by doing it.

**Unit economics.** Per SKU, segmentation plus attribute extraction plus ten drape
solves costs cents to low tens of cents of GPU time. Cached assets, with morph-target
packing and compression (section 11.3), run well under rev 1's 10–30 MB per SKU estimate;
storage is negligible either way. **CDN bandwidth is the cost that matters**, and it scales
with traffic rather than catalog size — which is why the section 11 budgets are commercial
terms, not engineering preferences. The per-SKU cost metric of section 16.5 replaces this
estimate with a measurement by the end of Phase 1.

---

## 19. Go to market — first ten stores

**Do not pitch with slides.** For each prospect, pre-build their actual store with
about fifteen of their own items pulled from their Instagram, then walk in and hand
them a phone. This costs roughly a weekend per prospect, converts far better than a
deck, and doubles as a test of Talla's own ingest pipeline.

**The first five are free 60-day pilots.** Price is not the ask. The ask is: Talla
shoots their catalog, they permit measurement, and Talla may publish the results. What
is being bought is a real before-and-after AOV figure from a real store — the asset
that unlocks every later sale.

**Two things to settle in writing before the first pilot** *(rev 2)*: the
controller/processor split from section 12.7, and explicit permission to publish the
measured results. Both are easy to agree while everyone is enthusiastic and very hard to
obtain afterwards, particularly the second one if the numbers turn out well.

---

## 20. Risks, ranked by probability of killing the project

1. **Output looks wrong on real store photos.** Not on a curated test tee, but on a
   real store's badly lit maroon hoodie. An uncanny mannequin is worse than none: the
   store removes it and tells other owners. Answered cheaply by Phase 0, now with a
   measurable color gate (section 9).
2. **Stores never upload.** 400 SKUs × 3 photos plus a fabric selection 400 times is
   more work than any small store will do. Mitigated by Talla shooting the first
   batch, bulk import from Instagram, and asking for twenty best sellers rather than a
   full catalog.
3. **Mobile performance, and specifically the Instagram in-app browser.** Most buyers
   arrive there, its WebGL is unreliable, and it will kill a heavy page. Addressed by the
   section 11 budgets, the device-tier ladder, and testing in that WebView from week one.
   *Rev 1 rated this generic "mobile performance"; the in-app browser is the sharp edge.*
4. **Value never proven, churn at month three.** Addressed by section 17 — including the
   statistical power problem, which is the part most likely to produce an unsellable
   number.
5. **A tenant isolation or upload-pipeline breach.** *New in rev 2, and correctly placed
   above the commodity risks below it.* One cross-tenant leak among five stores that all
   know each other ends the company in that market; there is no recovery narrative for
   "your competitor could read your margins". Addressed by section 12.
6. **Accidentally building a Shopify clone.** Addressed by the scope freeze rule in
   section 4.
7. **Large try-on products expand.** They serve fit within their own catalogs, in
   English. They will not build Arabic RTL storefronts with COD and merchandiser-pinned
   styling for a Cairo boutique. The moat is the local commerce work and store-pinned
   styling, not the model.
8. **No 3D garment artist on the team.** The block library is hand-authored. Budget
   for a freelance artist or licensed base garment assets. This is a real cost and
   skill gap to plan for now rather than when blocked.
9. **Privacy compliance, and it is not low.** *Rev 1 rated legal exposure low on the
   grounds that a generic mannequin means no biometric data. That reasoning holds for
   biometrics only.* Buyer name, phone, and address are collected from the first COD order
   and are personal data under Egypt's PDPL 151/2020 and its regional equivalents.
   Obligations attach immediately; see section 12.7. Buyer selfies would add a much harder
   category on top, which remains a stage-two decision.

---

## 21. What changed in rev 2

Every place rev 2 contradicts or materially extends rev 1, so the diff is reviewable
rather than buried.

| # | Rev 1 said | Rev 2 says | Why |
|---|---|---|---|
| 1 | Warm stone and sand neutrals | Achromatic UI; the stage is neutral gray | A warm surround shifts perceived garment hue — it worked against the spec's own color-truth goal. It is also the current generic default look. §13 |
| 2 | *(nothing on color management)* | Gray card in the capture protocol; normalize to it; ΔE gate in Phase 0 | Without a reference, "colors read true" is unverifiable, and color error is a top cause of refused COD parcels. §9 |
| 3 | Viewer pushes the outer layer along normals | The *over* variant is solved against an inflated body proxy | Uniform normal offset self-intersects at every concave region. Same cost, failure mode removed. §8 |
| 4 | 10 cached meshes per garment | One mesh plus nine quantized morph deltas | ~10× to ~1.4× on the wire, and body-size changes need no network request. Largest single bandwidth win. §11.3 |
| 5 | "Draco or meshopt" | meshopt | Draco's decode is several times slower on low-end mobile CPUs, landing directly in TTFD. §11.3 |
| 6 | *(nothing on device capability)* | Three-tier ladder with a sprite turntable at tier C | Many target buyers' phones cannot run the viewer, and the Instagram WebView loses WebGL contexts. §11.2 |
| 7 | FID; no memory budget | INP; hard 256 MB GPU texture ceiling | INP is the metric that catches a janky swap; exceeding GPU memory blanks the canvas rather than degrading. §11.1 |
| 8 | *(no security section)* | STRIDE model, sandboxed image worker, database-enforced tenancy, commerce integrity | Untrusted image parsing and multi-tenant data are the two highest-damage surfaces and were unaddressed. §12 |
| 9 | Legal exposure "currently low" | PDPL obligations attach from the first COD order | True for biometrics, wrong for ordinary PII — which is collected on day one. §12.7, risk 9 |
| 10 | Frozen `GarmentSpec` by agreement | Frozen by generated types, additive-only rule, and contract tests in CI | A social freeze does not survive a deadline. §7 |
| 11 | Eight modules | Nine — Asset Pipeline split out; boundaries enforced by a linter | Physical correctness and wire bytes are different jobs with different failure modes, and the pipeline is where the budget is actually enforced. §5, §16.2 |
| 12 | *(runtime shape unstated)* | Modular monolith plus a worker pool, explicitly not microservices | Two engineers; service boundaries would cost more than they return. §6 |
| 13 | Holdout slice, compare AOV | Items per order primary, sticky assignment, pre-registered analysis, power check, 20% holdout, report a CI | A pilot's sample is small; an unplanned analysis produces a number that does not survive the second sales conversation. §17 |
| 14 | *(nothing on motion, a11y, or design tokens)* | §13, §14, §15 | The spec asked for a specific look and specified none of it. |
| 15 | 10–30 MB cached per SKU | Materially lower after packing; replaced by a measured per-SKU cost metric | Estimates in a spec drift; the pipeline emits the real number. §11.3, §16.5 |

---

## 22. Build order

### Phase 0 — Truth test (2–3 weeks, no product)

Collect 50 real garments from 3 real stores, photographed the way those stores
actually photograph. Build two blocks only: tee and straight jean. The pipeline may be
half-manual — scripts and hand-work, whatever is fastest.

One question: **would a store owner publish this image?** Show the results to actual
owners and count the yeses.

**Gate: below roughly 70% yes, the fully-automatic thesis is wrong.** The response is
to pivot — narrower categories, an assisted pipeline, or paid per-SKU finishing.
Learning this in week three is far cheaper than in month nine.

Phase 0 also produces the frozen `GarmentSpec`.

**Added in rev 2 — three cheap gates that de-risk the phases nobody wants to redo:**

- **Color gate**: gray card in the protocol, median ΔE00 < 3 across the 50 garments (§9).
- **Device gate**: one garment rendered on the reference phone, in the Instagram in-app
  browser, measured against the TTFD budget. Discovering in Phase 2 that the target
  browser cannot run the viewer would invalidate the architecture, and this costs a day.
- **Typography gate**: the naskh display direction judged against real garment photography
  with real Arabic copy, at mobile sizes; confirm Noto Naskh, or fall back, and record it in
  ADR-006 (§13.2).

### Phase 1 — One store, end to end, ugly (6–8 weeks)

Single hardcoded tenant, no admin polish. Upload → understand → drape → viewer →
outfit → WhatsApp order. Five blocks. The goal is something to hand to a store owner
on a phone, not a product.

**Not deferrable past Phase 1**, because each is far more expensive to retrofit:

- The sandboxed image worker (§12.2) — it is the trust boundary, and the pipeline is built
  around it or through it.
- RLS on every table plus the CI isolation test (§12.3) — adding it later means auditing
  every query ever written.
- The device-tier ladder including tier C (§11.2) — a fallback bolted on later is always
  worse, and it is the only safe response to a lost WebGL context.
- Morph-target asset packing (§11.3) — it determines the asset format, so changing it later
  means re-publishing the whole catalog.
- The error taxonomy (§16.5) — codes are cheap on day one and a migration afterwards.

### Phase 2 — Three pilots (6–8 weeks)

Multi-tenant, admin panel, Arabic and RTL, COD orders, holdout instrumentation,
styling engine with store pins. Free 60-day pilots. The output is the AOV number.

Adds in rev 2: the full design and motion system (§13, §14), the accessibility pass (§15),
audit log and commerce integrity controls (§12.5, §12.8), the privacy notice, retention and
deletion paths (§12.7), and the pre-registered experiment plan (§17).

### Phase 3 — Sell

Price against the pilot numbers, grow the block library, then extract the widget for
the Shopify export path. Re-run the threat model before the widget ships: embedding
Talla in someone else's page is a new trust boundary and changes most of section 12.

---

## 23. Team split

- **Person A — engine.** Block library, Dress Solver, Asset Pipeline, Viewer, mobile
  performance, the device-tier ladder. This is the moat.
- **Person B — product, commerce, and stores.** Storefront, admin, tenancy and isolation,
  Arabic and RTL, design system, orders. Also owns sales: walking into shops and running
  pilots.

One of the two must own sales, and it should be whoever is less deep in the graphics
work. Ingest and Garment Understanding straddle the seam: build them jointly in Phase
0, then hand ownership to A.

The frozen `GarmentSpec` (section 7) is what allows this split to work without daily
coordination.

**Security ownership** *(rev 2)*: A owns the image worker sandbox; B owns tenant isolation,
authentication, and privacy. Both review any change to a trust boundary — the short list is
the image worker, RLS policies, session handling, and order confirmation. Everything else
merges without a second pair of eyes, or nothing will ship.

---

## 24. Decision log

Decisions recorded as they are made. Each is one paragraph: context, options, choice,
trade-off accepted. With two people, the failure mode is not disagreement but two
different remembered versions of an agreement.

**Recorded in rev 2:**

| ID | Decision | Trade-off accepted |
|---|---|---|
| ADR-001 | Modular monolith plus worker pool, not microservices | Coarse scaling; extraction cost if a module ever needs independent scale |
| ADR-002 | PostgreSQL with row-level security as the isolation mechanism | Policy complexity, and a small query-planning cost, in exchange for isolation the app layer cannot bypass |
| ADR-003 | Body sizes as morph targets, not separate meshes | Slightly more complex asset packing; large bandwidth and interaction win |
| ADR-004 | meshopt over Draco | Marginally larger files for materially faster decode on the target device class |
| ADR-005 | Achromatic UI, indigo accent | Less immediately warm than the rev 1 direction; the merchandise reads true and the brand does not look generated |
| ADR-006 | Noto Naskh Arabic for display, IBM Plex Sans Arabic for UI | Crossing superfamilies costs metric harmony; revisit at the Phase 0 typography gate, fallback is Noto Sans Arabic for body |
| ADR-007 | Phone OTP for store owner authentication | SMS delivery cost and reliability; matches how owners actually work |
| ADR-008 | WhatsApp handoff carries a reference, not order contents | An extra tap for the buyer; avoids disclosing PII to a third party |
| ADR-009 | Content-addressed immutable assets, one-year cache | Storage of superseded versions; cache invalidation ceases to be a problem |
| ADR-010 | Tier C sprite turntable built in Phase 1, not later | Pipeline work before it is provably needed; it is the only safe answer to a lost WebGL context |

**Still open, and not blockers for Phase 0:**

- **Technology choices** — 3D engine, segmentation model, cloth solver, web framework,
  hosting region. Chosen during implementation planning, informed by what Phase 0 proves.
  The hosting region choice is constrained by §12.7 and should be settled early.
- **Reference device** — the exact phone model, bought in week one and named here.
- **Buyer personalization** — measurements, then photo-derived bodies. Stage two, and it
  carries the biometric obligations noted in risk 9.
- **Manual finishing tier** — pricing and workflow for hand-corrected hero garments.
  Depends on the Phase 0 pass rate.
- **Payment beyond COD** — card and local wallets, once stores ask for it. Adds PCI scope
  and requires a new threat model pass.
- **Widget extraction for Shopify** — Phase 3, gated on pilot numbers.
