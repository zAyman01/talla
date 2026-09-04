# Talla — Design Spec

**Date:** 2026-09-04
**Status:** Design approved in brainstorming, not yet planned or built
**Authors:** Mahmoud Ayman + partner

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

**Identity constraint that is also a product constraint:** the interface stays in warm
stone and sand neutrals with a single accent. Garment colors must read true, and a
colorful UI misrepresents the merchandise.

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
- Analytics beyond the instrumentation described in section 10
- Buyer body scanning, selfies, or measurements

**Scope freeze rule:** if a feature is not required to complete a cash-on-delivery
order, it is refused until stores are paying. Commerce depth is not the moat, and it
absorbs unlimited time.

---

## 5. Architecture — modules

Eight modules, each with one job and a defined interface.

| Module | Responsibility | Depends on |
|---|---|---|
| **Ingest** | Accept store photos plus metadata. Enforce the capture protocol. Reject bad input with a specific reason before it reaches anything downstream. | — |
| **Garment Understanding** | Segment the garment from background, classify category, extract texture and color, read attributes. Emits one `GarmentSpec` plus texture assets. | Ingest |
| **Block Library** | Hand-authored parametric 3D garment blocks, their UV layouts, and fabric presets. Static, versioned, authored by an artist rather than generated. | — |
| **Dress Solver** | Given a `GarmentSpec`, a block, and a body size, produce a draped mesh. Runs at upload time only. | Understanding, Block Library |
| **Viewer** | Browser 3D. Load mannequin and cached meshes, resolve layering, render. | Dress Solver output |
| **Styling Engine** | Rank which garments go together. Drives the "complete the look" surface. | `GarmentSpec`, Commerce (stock) |
| **Commerce** | Catalog, cart, orders, COD, store admin. | Tenancy |
| **Tenancy** | One store per tenant: subdomain, theme, isolated data. | — |

**Governing rule:** all expensive computation happens at upload, once per garment.
A buyer click only loads cached geometry. This is what makes the unit economics work
and what keeps the viewer fast.

---

## 6. The `GarmentSpec` contract

`GarmentSpec` is the seam of the whole system: Garment Understanding emits it, and
the Dress Solver, Viewer, Styling Engine, and Commerce all consume it. **It is frozen
at the end of Phase 0 and changed only by explicit agreement between both authors.**
A stable contract is what lets two people work in parallel without blocking.

Fields:

- `id`, `tenant_id`, `source_photo_refs`
- `category` — enum matching a block in the Block Library
- `block_id`, `block_version`
- `fabric` — cotton jersey, denim, silk/viscose, wool, leather (store-selected)
- `attributes` — sleeve length, neckline, hem, closure, rise, leg shape
- `textures` — front, back, detail; UV-ready assets
- `sizes_available`, per-size stock reference
- Style fields used by the Styling Engine:
  - `formality` — 1 (beachwear) to 5 (tailored)
  - `season` — hot / mild / cold / all
  - `dominant_colors` — 1–3 colors in LAB with weights
  - `pattern_busy` — 0.0 to 1.0
  - `volume` — slim / regular / oversized
  - `slot` — outer / top / bottom / shoes / bag / accessory
- `confidence` per derived field, and `confirmed_by_store` boolean

---

## 7. Pipeline

### Store side — once per garment, target under two minutes of the owner's time

1. **Shoot to protocol.** Front, back, and one three-quarter angle. Flat on a plain
   surface or on a form. The protocol is enforced, not suggested — inconsistent input
   is the primary cause of bad output.
2. **Enter metadata.** Fabric from a short dropdown, price, sizes, stock.
3. **Ingest validates.** Checks angle coverage, background plainness, sharpness, and
   whether the garment is fully in frame. Failures are specific and actionable
   ("back photo missing", "image too dark"), never generic errors.
4. **Understanding runs**, emitting a `GarmentSpec`.
5. **Store confirms.** A single screen: *"We read this as: relaxed crew-neck tee,
   short sleeve, cotton jersey. Correct?"* with dropdowns to correct any field.
   This screen is the quality insurance of the entire system — it converts model
   guesses into store-verified facts for about five seconds of the owner's time, and
   it removes the "it looks wrong and I cannot fix it" failure that would otherwise
   cause churn.
6. **Dress Solver drapes** the garment onto each preset body: 5 sizes × 2 body types
   = 10 solves. Meshes are cached. This runs in the background over minutes; the item
   goes live when it completes.

### Buyer side — instant

Browse catalog → tap a garment → the mannequin wears it by loading a cached mesh, with
no computation → tap another top to swap → add a bottom to layer → rotate and zoom →
the Styling Engine's "goes with" strip sits below → the whole outfit adds to cart in
one tap.

### Layering

Outfit combinations are never simulated. Each garment is cached at two layer depths,
*base* and *over*. At render time the viewer sorts by depth and pushes the outer
shell out slightly along its normals.

This keeps cost additive rather than multiplicative: N tops × M bottoms × K jackets
would be intractable to precompute and too slow to solve live.

### Known quality limits

Output will be weakest on unusual silhouettes snapped to a nearest block, on very thin
fabrics close to the body, and on structured garments such as corsets and tailored
coats. A manual override path for these is a later, priced feature — not a v1 gap to
hide.

---

## 8. Styling engine

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
4. **Soft score.** Color harmony in LAB (neutrals pair with anything; otherwise
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

---

## 9. Performance budgets

The buyer is on a mid-range Android phone on 4G. These are hard budgets, verified on a
real inexpensive device from the first week — a development laptop will not surface
these problems.

- First paint: under 2.5s
- First garment dressed on the mannequin: under 4s
- Sustained 30fps while rotating and swapping

**Bandwidth is the real cost driver**, not compute or storage. Meshes are compressed
(Draco or meshopt), shipped with aggressive LOD, and lazy-loaded beyond the first
garment. Getting this wrong damages margin and load time simultaneously — they are the
same problem.

---

## 10. Instrumentation

The promise is "sell more per order," so proving it is a v1 requirement rather than a
later addition.

A slice of visitors is held out from the mannequin experience. Talla compares items
per order and average order value between the held-out slice and the rest. Without
this measurement, Talla is selling a wow factor at a wow-factor price and will churn
around month three.

---

## 11. Business model

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
solves costs cents to low tens of cents of GPU time. Cached meshes run roughly
10–30MB per SKU, so a 500-SKU store is about 15GB of storage — negligible. CDN
bandwidth is the cost that matters and is addressed by the budgets in section 9.

---

## 12. Go to market — first ten stores

**Do not pitch with slides.** For each prospect, pre-build their actual store with
about fifteen of their own items pulled from their Instagram, then walk in and hand
them a phone. This costs roughly a weekend per prospect, converts far better than a
deck, and doubles as a test of Talla's own ingest pipeline.

**The first five are free 60-day pilots.** Price is not the ask. The ask is: Talla
shoots their catalog, they permit measurement, and Talla may publish the results. What
is being bought is a real before-and-after AOV figure from a real store — the asset
that unlocks every later sale.

---

## 13. Risks, ranked by probability of killing the project

1. **Output looks wrong on real store photos.** Not on a curated test tee, but on a
   real store's badly lit maroon hoodie. An uncanny mannequin is worse than none: the
   store removes it and tells other owners. Answered cheaply by Phase 0.
2. **Stores never upload.** 400 SKUs × 3 photos plus a fabric selection 400 times is
   more work than any small store will do. Mitigated by Talla shooting the first
   batch, bulk import from Instagram, and asking for twenty best sellers rather than a
   full catalog.
3. **Mobile performance.** Addressed by section 9's budgets and by testing on real
   low-end hardware from week one.
4. **Value never proven, churn at month three.** Addressed by section 10.
5. **Accidentally building a Shopify clone.** Addressed by the scope freeze rule in
   section 4.
6. **Large try-on products expand.** They serve fit within their own catalogs, in
   English. They will not build Arabic RTL storefronts with COD and merchandiser-pinned
   styling for a Cairo boutique. The moat is the local commerce work and store-pinned
   styling, not the model.
7. **No 3D garment artist on the team.** The block library is hand-authored. Budget
   for a freelance artist or licensed base garment assets. This is a real cost and
   skill gap to plan for now rather than when blocked.
8. **Legal exposure, currently low.** A generic mannequin means no biometric data, and
   stores own their photos. This holds only until buyer selfies are accepted, at which
   point consent, storage, and deletion obligations follow. That is a stage-two
   decision with stage-two cost.

---

## 14. Build order

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

### Phase 1 — One store, end to end, ugly (6–8 weeks)

Single hardcoded tenant, no admin polish. Upload → understand → drape → viewer →
outfit → WhatsApp order. Five blocks. The goal is something to hand to a store owner
on a phone, not a product.

### Phase 2 — Three pilots (6–8 weeks)

Multi-tenant, admin panel, Arabic and RTL, COD orders, holdout instrumentation,
styling engine with store pins. Free 60-day pilots. The output is the AOV number.

### Phase 3 — Sell

Price against the pilot numbers, grow the block library, then extract the widget for
the Shopify export path.

---

## 15. Team split

- **Person A — engine.** Block library, Dress Solver, Viewer, mobile performance.
  This is the moat.
- **Person B — product, commerce, and stores.** Storefront, admin, tenancy, Arabic and
  RTL, orders. Also owns sales: walking into shops and running pilots.

One of the two must own sales, and it should be whoever is less deep in the graphics
work. Ingest and Garment Understanding straddle the seam: build them jointly in Phase
0, then hand ownership to A.

The frozen `GarmentSpec` (section 6) is what allows this split to work without daily
coordination.

---

## 16. Decisions deferred

These are deliberately open and are not blockers for Phase 0.

- **Technology choices** — 3D engine, segmentation model, cloth solver, web framework,
  hosting. Chosen during implementation planning, informed by what Phase 0 proves.
- **Buyer personalization** — measurements, then photo-derived bodies. Stage two, and
  it carries the biometric obligations noted in risk 8.
- **Manual finishing tier** — pricing and workflow for hand-corrected hero garments.
  Depends on the Phase 0 pass rate.
- **Payment beyond COD** — card and local wallets, once stores ask for it.
- **Widget extraction for Shopify** — Phase 3, gated on pilot numbers.
