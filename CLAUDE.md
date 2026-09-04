# Working rules for this repository

Read this before writing code or docs here. It applies to humans and to agents equally.

Talla is at design stage. The design is specified in
[`docs/superpowers/specs/2026-09-04-talla-design.md`](docs/superpowers/specs/2026-09-04-talla-design.md).
**The spec is the source of truth.** If code and spec disagree, one of them is a bug, and
which one is a decision, not an accident. Record it in `docs/decisions/`.

---

## 1. The rule that matters most

**Do not improvise the interface.**

Every visual decision in this product is already made and written down: color in
[`docs/frontend/design-system.md`](docs/frontend/design-system.md), motion in
[`docs/frontend/motion.md`](docs/frontend/motion.md), tokens in
[`docs/frontend/tokens.css`](docs/frontend/tokens.css). If you are about to pick a hex
value, a duration, a font size, a radius, or an easing curve, stop. It is already chosen.
If what you need is genuinely missing, add it to the token file and say so, rather than
inlining a one-off value that nobody will ever find again.

A page assembled from whatever looked reasonable at the time is the failure mode this
document exists to prevent.

## 2. Before you start

1. Read the relevant spec section. The spec's table of contents maps cleanly to modules.
2. Read [`docs/frontend/README.md`](docs/frontend/README.md) if you are touching any UI.
   It carries the design read, the surface split, and the banned-pattern list.
3. Check `docs/decisions/` for an ADR covering what you are about to decide. If one
   exists, follow it. If it is wrong, supersede it with a new ADR; do not quietly deviate.

## 3. Boundaries

The modules in spec section 5 are real boundaries, enforced by a linter in CI.

- A module is imported through its published interface only, never through its internals.
- Shared code lives in an explicit `shared` module. There is no `utils` module and there
  will not be one.
- `GarmentSpec` types are **generated** from
  [`docs/architecture/garment-spec.schema.json`](docs/architecture/garment-spec.schema.json).
  Never hand-write them. Never edit generated files.

## 4. Non-negotiables

These are not preferences. Each one is expensive or impossible to retrofit.

| Rule | Where it is specified |
|---|---|
| Every tenant-scoped table has row-level security. No exceptions, no "add it later". | Spec 12.3 |
| Untrusted images are parsed only inside the sandboxed, network-isolated worker. | Spec 12.2 |
| Buyer PII never appears in a log line, including inside error payloads. | Spec 16.5 |
| The client never sends a price. Totals are recomputed server side. | Spec 12.5 |
| Session cookies are host-only. Never scoped to the parent domain. | Spec 12.4 |
| Animate `transform` and `opacity` only. | Spec 14.1 |
| Every asset publish passes the size budget or the garment does not go live. | Spec 11.3 |

## 5. Writing code

- One language across storefront, admin, and API, so two people stay interchangeable.
- Strict typing on. `any` requires a comment naming the reason.
- Match the surrounding code. Its comment density and naming are the house style, not
  whatever you would write greenfield.
- No dead code, no commented-out blocks, no `TODO` without an owner and a date.
- Feature flags carry a removal date in the code.

## 6. Writing copy

Copy is design content. It follows
[`docs/frontend/README.md` section 6](docs/frontend/README.md), and two rules bind hard:

- **Arabic first.** Write the Arabic string first, then the English. A UI translated out
  of English reads translated, and the primary market notices immediately.
- **Zero em-dashes in anything a user sees.** Use a period, a comma, a colon, or
  parentheses. This applies to headlines, labels, buttons, errors, empty states, and alt
  text.

## 7. Committing

- Trunk based. Short-lived branches. Squash merge.
- Conventional commits. The changelog is generated from them.
- Migrations are forward-only. Never edit a migration that has shipped.
- Every gate in CI blocks merge. If a gate is wrong, fix the gate; do not skip it.

## 8. When you are unsure

Ask, or write it down and proceed under a stated assumption. Do not silently pick.
With two people on this, an undocumented decision becomes two different remembered
versions of an agreement within a month.
