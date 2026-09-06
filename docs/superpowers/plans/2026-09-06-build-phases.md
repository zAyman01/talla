# Talla build phases

> Planning document. Maps the spec's build order (section 22) onto executable engineering
> phases, each with an entry gate, a deliverable, and an exit gate. Detailed task plans
> live beside this file, one per phase.

**Spec:** [`../specs/2026-09-04-talla-design.md`](../specs/2026-09-04-talla-design.md)

The spec's section 22 gives four phases in product terms. It assumes a repository that
already builds, typechecks, generates `GarmentSpec` types, and enforces its own boundaries.
No such repository exists yet, so the phase list below adds Phase F ahead of spec Phase 0
and leaves the spec's numbering untouched.

---

## Phase list

| Phase | Name | Spec | Output | Exit gate |
|---|---|---|---|---|
| **F** | Foundation | 16.1, 16.2, 16.4, 7 | A repository that builds, typechecks, generates the contract, and fails on a boundary violation | Every CI gate that can exist without application code is green and blocking |
| **0** | Truth test | 22 Phase 0 | 50 garments through a half-manual pipeline, judged by real owners | ≥ 70% "would publish", median ΔE00 < 3, device gate, typography gate |
| **1** | One store, end to end, ugly | 22 Phase 1 | Upload to WhatsApp order on one hardcoded tenant, five blocks | The five non-deferrables shipped: image sandbox, RLS + isolation test, tier ladder including C, morph packing, error taxonomy |
| **2** | Three pilots | 22 Phase 2 | Multi-tenant, admin, Arabic and RTL, COD, holdout instrumentation | An AOV number from real pilots, design and motion system landed, privacy paths live |
| **3** | Sell | 22 Phase 3 | Pricing, block library growth, Shopify widget extraction | Threat model re-run before the widget ships |

Phases run in order. A later phase never waives an earlier phase's gate
([`docs/README.md`](../../README.md), "Keeping these honest").

---

## Phase F — Foundation

**Why it exists.** Spec 16 says standards must be mechanical, because anything enforced by
intention gets traded away in week six. Mechanical enforcement is code, and that code is
not free. Building it first costs about a week; retrofitting an import-boundary linter
onto ten modules that already import each other's internals costs far more, and the
generated `GarmentSpec` types are a prerequisite for every producer and consumer written
after them.

**Deliverable.** A pnpm workspace with the layout in
[`architecture/overview.md`](../../architecture/overview.md), strict TypeScript, generated
`GarmentSpec` types, generated design tokens, a typed error taxonomy, a boundary linter
that fails on a planted violation, and a CI workflow where every gate blocks merge.

**Not in Phase F.** No application code, no database, no Next.js app, no rendering. Gates
that need those (RLS isolation, bundle size, asset budget, Lighthouse) are stubbed as
documented-not-yet-wired and land with the code they measure.

**Detailed plan:** [`2026-09-06-phase-f-foundation.md`](2026-09-06-phase-f-foundation.md)

**Exit gate.**

- `pnpm typecheck`, `pnpm lint`, `pnpm boundaries`, `pnpm test` all pass locally and in CI.
- A deliberate cross-module internal import fails `pnpm boundaries`.
- `packages/garment-spec` types are generated from
  [`garment-spec.schema.json`](../../architecture/garment-spec.schema.json) and a
  hand-edit is detected by CI.
- Every error code in [`error-taxonomy.md`](../../architecture/error-taxonomy.md) exists in
  code with Arabic and English copy and a fix action, and no user-facing string contains an
  em-dash.
- Tooling choices recorded as an ADR.

---

## Phase 0 — Truth test

**Entry:** Phase F exit gate green.

**Engineering work.** Two blocks (tee, straight jean). A half-manual pipeline: scripts plus
hand-work, run from the command line, no service and no queue. A color-checking script that
reads the gray card and reports ΔE00. One garment rendered on the reference device inside
the Instagram in-app browser, timed against the TTFD budget.

**Non-engineering work.** 50 garments from 3 real stores, photographed the way those stores
actually photograph. Show results to owners, count the yeses.

**Exit gate (spec 22).** ≥ 70% "would publish", median ΔE00 < 3 across the 50, device gate
met on the reference phone, typography direction confirmed or ADR-006 amended. Below the
yes threshold, the fully-automatic thesis is wrong and the response is a pivot, not a
Phase 1.

`GarmentSpec` is already written down; Phase 0 either confirms it or amends it, and it
freezes at the phase exit.

---

## Phase 1 — One store, end to end, ugly

**Entry:** Phase 0 exit gate passed.

Single hardcoded tenant, no admin polish, five blocks, upload to WhatsApp order. The goal
is something to hand a store owner on a phone.

**Non-deferrable in this phase** (spec 22, each far more expensive to retrofit):

1. Sandboxed, network-isolated image worker (12.2).
2. RLS on every tenant-scoped table plus the CI isolation test (12.3).
3. The device-tier ladder including tier C (11.2).
4. Morph-target asset packing (11.3).
5. The error taxonomy wired into every failure path (16.5) — the codes land in Phase F, the
   paths that raise them land here.

**Exit gate.** The one end-to-end path from spec 16.3 runs green in CI: upload, confirm,
solve, live, dress, outfit, COD order. Asset budget gate fails an over-budget fixture.

---

## Phase 2 — Three pilots

**Entry:** Phase 1 exit gate green.

Multi-tenant, admin panel, Arabic and RTL, COD orders, holdout instrumentation, styling
engine with store pins, the full design and motion system, the accessibility pass, audit
log and commerce integrity controls, privacy notice with retention and deletion paths, and
the pre-registered experiment plan.

**Exit gate.** Three pilots running, an AOV comparison between the held-out slice and the
rest, WCAG 2.2 AA pass on the storefront, and the privacy paths exercised end to end.

---

## Phase 3 — Sell

**Entry:** Phase 2 produced an AOV number worth pricing against.

Price against the pilot numbers, grow the block library, extract the widget for the Shopify
export path.

**Exit gate.** The threat model is re-run before the widget ships. Embedding Talla in
someone else's page is a new trust boundary and changes most of spec section 12.

---

## What this plan does not decide

Two technology choices stay open and belong to Person A, made from what Phase 0 proves
(spec 24): the segmentation model, and the cloth solver. Nothing in Phase F depends on
either.
