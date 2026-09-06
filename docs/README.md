# Documentation

Talla is at design stage. The repository now carries its foundation: a workspace, the
generated contracts, the module interfaces, and the CI gates. No product behavior yet.

**The spec is the product source of truth.** The schema, token file, and accepted decision
records are the implementation contracts that make it executable. Everything else here
explains or operationalizes those contracts. Where documents disagree, stop and resolve
the conflict in a decision record before building.

---

## Start here

| If you are | Read |
|---|---|
| New to the project | [The spec](superpowers/specs/2026-09-04-talla-design.md), sections 1 to 4 |
| About to write any UI | [`frontend/README.md`](frontend/README.md), then [`frontend/design-system.md`](frontend/design-system.md) |
| About to write backend or pipeline code | [`architecture/overview.md`](architecture/overview.md) |
| Wondering why something is the way it is | [`decisions/`](decisions/) |
| Setting up a store | [`operations/capture-protocol.md`](operations/capture-protocol.md) |

Working rules for contributors are in [`../CLAUDE.md`](../CLAUDE.md). Process is in
[`../CONTRIBUTING.md`](../CONTRIBUTING.md).

## Map

```
docs/
  superpowers/specs/
    2026-09-04-talla-design.md   The spec. Source of truth. Sections 1 to 24.

  architecture/
    overview.md                  Repository layout, module contracts, trust boundaries
    garment-spec.md              The central contract, explained
    garment-spec.schema.json     The central contract, machine readable
    error-taxonomy.md            Stable codes, Arabic and English copy, fix actions

  frontend/
    README.md                    Design read, surface split, dials, banned patterns, pre-flight
    design-system.md             Color, typography, space, RTL, components, and the reasoning
    tokens.css                   Machine-readable design tokens. A raw component value is a bug
    motion.md                    Motion system and the drape settle
    accessibility.md             WCAG 2.2 AA, the canvas problem, the Arabic problem

  operations/
    capture-protocol.md          How a garment is photographed, and why each rule exists
    security-checklist.md        Operational companion to spec section 12

  superpowers/plans/
    2026-09-06-build-phases.md   Phase F to Phase 3, with the gate that ends each
    2026-09-06-phase-f-foundation.md  The foundation phase, task by task

  decisions/
    README.md                    Index and format
    0001 to 0015                 Accepted decisions
```

## How these relate to the spec

| Spec section | Elaborated in |
|---|---|
| 5, 6 Architecture | [`architecture/overview.md`](architecture/overview.md) |
| 7 `GarmentSpec` | [`architecture/garment-spec.md`](architecture/garment-spec.md) and the schema |
| 8, 9 Pipeline and color | [`operations/capture-protocol.md`](operations/capture-protocol.md) |
| 11 Performance | Budgets stay in the spec. Frontend rules in [`frontend/README.md`](frontend/README.md) |
| 12 Security and privacy | [`operations/security-checklist.md`](operations/security-checklist.md) |
| 13 Design system | [`frontend/design-system.md`](frontend/design-system.md), [`frontend/tokens.css`](frontend/tokens.css) |
| 14 Motion | [`frontend/motion.md`](frontend/motion.md) |
| 15 Accessibility | [`frontend/accessibility.md`](frontend/accessibility.md) |
| 16 Engineering standards | [`../CLAUDE.md`](../CLAUDE.md), [`../CONTRIBUTING.md`](../CONTRIBUTING.md), [`architecture/error-taxonomy.md`](architecture/error-taxonomy.md) |
| 24 Decision log | [`decisions/`](decisions/) |

## Keeping these honest

A document that has drifted from the code is worse than no document, because someone will
trust it.

- A change that contradicts a document updates that document in the same pull request.
- A decision that a future contributor might want to reverse gets a record in
  [`decisions/`](decisions/).
- Accepted decision records are never edited to change their meaning. They are superseded.
- The schema and token file are reviewed like code. A consumer change without its contract
  update is incomplete.
- The spec's phase gates are release gates. A later phase cannot silently waive an earlier
  failure.
