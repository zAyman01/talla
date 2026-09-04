# Capture protocol

How a garment is photographed. The protocol is enforced by Ingest, not suggested, because
inconsistent input is the primary cause of bad output and no amount of downstream model
quality recovers from it.

Target: **under two minutes of the store owner's time per garment**, including metadata.

---

## The kit

Every onboarding store gets a physical kit. It costs very little and it is what makes the
protocol teachable in one visit.

| Item | Why |
|---|---|
| Neutral gray card | The color reference. Without it, "colors read true" is a hope rather than a measurement. See spec section 9 |
| Plain light backdrop cloth | Removes the "background too busy" rejection, which is otherwise the most common one |
| Phone stand | Removes camera shake, which removes the blur rejection |

## The shots

Three per garment, always in this order.

1. **Front.** Garment laid flat or on a form, filling most of the frame, gray card flat
   beside it in the same light.
2. **Back.** Same framing, same light, card still in frame.
3. **Three quarter.** Turned roughly halfway between front and side. This is the shot that
   gives the solver its silhouette information, and it is the one owners skip.

A detail shot is optional and is used for texture only.

## Rules that Ingest checks

| Rule | Rejection code |
|---|---|
| All three angles present | `INGEST_BACK_PHOTO_MISSING`, `INGEST_ANGLE_MISSING` |
| Gray card visible and lit the same as the garment | `INGEST_GRAY_CARD_MISSING`, `INGEST_GRAY_CARD_UNREADABLE` |
| Whole garment inside the frame | `INGEST_GARMENT_CROPPED` |
| Background plain | `INGEST_BACKGROUND_BUSY` |
| Sharp enough | `INGEST_BLURRY` |
| Bright enough to read color | `INGEST_TOO_DARK` |

Every rejection names the shot and the fix. See
[`../architecture/error-taxonomy.md`](../architecture/error-taxonomy.md).

## Light

- **Natural light near a window is best.** Say this first when teaching, because it is free
  and it is what the owner already has.
- **Do not mix sources.** A window plus a warm ceiling bulb produces two illuminants in one
  frame, and the gray card can only correct for one.
- **Avoid direct sun.** It blows out highlights, and a blown highlight has no color to read.
- **No flash.** Phone flash flattens texture and shifts color.

## What the store enters

Four fields, all dropdowns or numbers, none free text:

1. Fabric, from the short list in the schema. Store selected, never inferred, because
   fabric drives drape and a wrong drape is visible immediately.
2. Price.
3. Sizes carried.
4. Stock per size.

## Confirmation

After Understanding runs, the owner sees one screen:

> We read this as: relaxed crew neck tee, short sleeve, cotton jersey. Correct?

with a dropdown on every field. Roughly five seconds of the owner's time, and it converts
model guesses into store-verified facts. It is the quality insurance of the whole pipeline,
and it removes the "it looks wrong and I cannot fix it" failure that would otherwise cause
churn.

Fields the store corrects are recorded in `confirmed_fields` and are immune to
re-processing. A re-run that overwrote an owner's corrections would teach them to stop
correcting.

## Talla shoots the first batch

Regardless of whether the setup fee is charged. Two reasons, and the second matters more:

1. Store photo quality is the largest quality risk in the system.
2. The capture protocol is learned by doing it. Every rule above came from someone
   photographing real garments in a real shop, and the next revision will too.

Ask for twenty best sellers, not a full catalog. A store that has to photograph four
hundred pieces before seeing anything will photograph zero.

## Phase 0 gate

For the fifty test garments, measure delta E between the physical garment and the rendered
mannequin. **Median delta E00 under 3 passes. Over 5 fails**, and a failure means the
capture protocol is wrong, not the model.
