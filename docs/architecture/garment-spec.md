# The `GarmentSpec` contract

`GarmentSpec` is the seam of the system. `understanding` emits it; `solver`, `assets`,
`viewer`, `styling`, and `commerce` all consume it. It is what lets two people work in
parallel without daily coordination.

The machine-readable definition is
[`garment-spec.schema.json`](garment-spec.schema.json). **That file is the contract.**
This document explains it.

---

## How the contract is held

"Frozen by agreement" is a social control and will not survive a deadline. Three
mechanical ones hold it instead.

1. **Generated types.** Every consumer's types come from the schema, into
   `packages/garment-spec`. No one hand-writes a `GarmentSpec` type, so no one can drift.
2. **Additive only within a major version.** New optional fields are fine. A removal, a
   rename, or a narrowing is a major bump and requires a migration for stored specs.
3. **Contract tests in one CI job.** Producer fixtures and consumer expectations run
   together, so a change that breaks the viewer fails the understanding module's pull
   request rather than surfacing as a bug next month.

## Field groups

**Identity and provenance**

`spec_version`, `id`, `tenant_id`, `source_photo_refs`. `spec_version` is the schema
version, not the garment version. A re-solve of the same garment keeps its `id`.

**Classification**

`category` is an enum, and every value maps to exactly one block in the block library. If
`understanding` cannot map a garment to a block, that is a rejection, not a guess.
`block_id` and `block_version` pin the exact geometry used, so a render is reproducible
after the library moves on.

**Material**

`fabric` is store selected from a short list, never inferred. Fabric drives the solver's
drape behaviour and getting it wrong is visible immediately, so a five-second dropdown
beats a confident model.

**Geometry attributes**

`attributes` carries sleeve length, neckline, hem, closure, rise, and leg shape. These
feed both the solver and the buyer-facing text description used by screen readers.

**Textures and color**

`textures` are UV-ready front, back, and detail assets. `color_profile` records the
capture illuminant, the gray card reference, and the working color space, so a wrong color
is diagnosable rather than mysterious. See
[`../operations/capture-protocol.md`](../operations/capture-protocol.md).

**Commerce**

`sizes_available` plus a per-size stock reference. The spec holds the reference, not the
count. Price, stock quantity, and order state belong to `commerce`, not this contract.
Stock changes far more often than a spec does and must not force a re-publish.

**Style fields**

Consumed only by `styling`:

| Field | Range | Used for |
|---|---|---|
| `formality` | 1 beachwear to 5 tailored | Hard rule. Gap greater than 1 is rejected |
| `season` | hot, mild, cold, all | Hard rule |
| `dominant_colors` | 1 to 3 CIELAB values with weights | Soft score. Harmony in a perceptual space, not in RGB |
| `pattern_busy` | 0.0 to 1.0 | Soft score. At most one busy piece per outfit |
| `volume` | slim, regular, oversized | Soft score. Volume balance |
| `slot` | outer, top, bottom, shoes, bag, accessory | Slot model. Eliminates most nonsense before scoring |

## Confidence and confirmation

Every derived field carries a `confidence`. `confirmed_fields` records the dotted paths
the store reviewed or corrected, and `confirmed_by_store` marks the complete confirmation
step after the confirmation screen.

**A re-run never overwrites a store-confirmed field.** Inherit prior confirmations. Losing
an owner's corrections is the fastest way to make them stop correcting, and the
confirmation screen is the quality insurance of the whole pipeline.

## Changing the schema

1. Open an ADR if the change alters what a consumer can rely on.
2. Edit `garment-spec.schema.json`. Additive changes only, unless you are bumping major.
3. Regenerate `packages/garment-spec`. Never edit generated output.
4. Add a fixture covering the new shape.
5. CI runs producer and consumer contract tests together. Green means every consumer
   already handles it.

If a change requires touching more than two consumers, it is probably the wrong change.
The contract exists to absorb variation, not to propagate it.
