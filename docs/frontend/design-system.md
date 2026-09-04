# Design system

The values live in [`tokens.css`](tokens.css). This document says why they are what they
are, which is the part that stops the next person from quietly changing them.

---

## 1. Color

**The merchandise is the only saturated color on the page.** Everything below follows from
that one sentence.

### Why achromatic

Perceived color is judged against its surround. A warm background pushes a garment's
apparent hue cooler and mutes warm reds, which is exactly the error that gets a parcel
refused at the door when the buyer sees the real thing. Retouchers judge color against
neutral gray for this reason, and Talla's entire promise depends on the render matching the
garment.

So the stage is achromatic in both themes, and the interface around it stays close to
achromatic too.

### What was rejected, and why it matters

The original direction was warm stone and sand neutrals with a single accent. Two problems:

1. **Warm neutrals bias the merchandise.** The direction worked against the constraint it
   was written to serve.
2. **Warm cream ground plus a terracotta accent is the current default look**, produced by
   every design tool reaching for "premium and considered". A brand that looks like every
   other brand is not an identity. Worse here specifically: rust and clay are common garment
   colors, so the accent would have collided with the catalog as well as with everyone
   else's homepage.

Talla spends its boldness on typography instead. That is more distinctive, and for a
product whose promise is honest color, it is the only defensible place to spend it.

### The accent

One accent, `--accent` indigo `#26356b`. It appears on the primary CTA, the active
navigation indicator, and the focus ring. Nothing else.

Indigo because indigo dyeing has a long history across North Africa and the Levant, so it
reads as considered rather than arbitrary, and because a deep desaturated blue is the color
least likely to compete with a store's actual stock. See
[ADR-0005](../decisions/0005-achromatic-palette-indigo-accent.md).

Rules:

- Semantic tokens in components. A raw hex is a bug.
- At most two accent instances per screen.
- Nothing chromatic within 200px of a garment.
- Status colors carry an icon and a label. Color alone never conveys meaning, because
  roughly one in twelve men cannot separate the pair you chose.

### Dark mode

A designed palette, not an inversion. The accent lifts and desaturates so it stays visible
without glowing, while still reading as the same brand color.

**The stage stays mid-value in both themes.** A near-black stage makes light garments glare
and dark garments disappear. An accurate stage matters more than a consistent one, and this
is the one place the two goals conflict.

Contrast is verified separately in each theme. Light-mode values do not transfer.

## 2. Typography

Arabic first. A UI designed in English and then translated reads translated, and the
primary market notices in seconds.

| Role | Face | Where |
|---|---|---|
| Display | Noto Naskh Arabic | Wordmark, marketing hero. Never inside the storefront UI |
| UI and body, Arabic | IBM Plex Sans Arabic | Everything a user reads while operating the product |
| UI and body, Latin | IBM Plex Sans | Mixed-script lines. Same superfamily as the UI Arabic, so metrics match |
| Numerals | IBM Plex Sans, tabular | Prices, quantities, stock |

### The naskh display choice

Every competing MENA storefront is set in Cairo or Tajawal. A naskh display reads as
tailoring and heritage rather than as another tech product, which is the position Talla
wants and the reason this is where the design takes its risk.

Two trade-offs accepted knowingly:

- **Noto Naskh over Amiri.** Amiri is the more characterful naskh, but it carries a
  devotional association a clothing brand does not want to inherit.
- **Crossing superfamilies.** Display and body come from different families, so their
  metrics do not harmonize. Acceptable only because the display face never shares a line
  with body text. If a review finds the pairing incoherent, the harmonized fallback is Noto
  Sans Arabic for body, trading UI character for metric unity.

Decided at the Phase 0 typography gate. See
[ADR-0006](../decisions/0006-arabic-first-typography.md).

### Scale

1.2 ratio, 16px base. **Never below 14px for Arabic body text.** Arabic loses legibility at
small sizes faster than Latin, and shrinking it to fit is the most common Arabic typography
failure in production.

Line height 1.7 for Arabic, 1.55 for Latin. Arabic needs the vertical room for ascenders,
descenders, and diacritics.

Measure: 40 to 55 characters on mobile, 60 to 75 on desktop. Arabic words are shorter, so
the mobile figure is lower than the usual Latin advice.

Weight carries hierarchy: 600 headings, 500 labels, 400 body. Not raw scale.

### Numerals

**Western Arabic digits (1234) by default** for prices and quantities. That is what Egyptian
and Gulf storefronts use and what buyers scan fastest. Eastern digits are available per
locale but are not the default.

Prices use tabular figures and are isolated with `direction: ltr` inside RTL text, so a grid
of prices does not shimmer as it re-renders and a currency symbol does not jump sides.

### Banned

- All-caps labels. Arabic has no case, so a Latin all-caps label beside Arabic announces
  that the design was made in English first.
- Truncated or ellipsized prices. Ever.
- Gradient text on headlines.
- Emphasis by switching font family mid-headline. Use weight or italic within the same
  family.

## 3. Space, shape, layers

4px base, 8px rhythm. Radius by hierarchy level, not one value everywhere:

| Level | Radius |
|---|---|
| Viewer stage | 0 |
| Inputs, chips | 6px |
| Cards, sheets | 12px |
| Full-screen sheets | 20px |
| Pills, avatars | full |

Z-index comes from the documented scale in the token file. An arbitrary `z-50` in a
component is a bug.

Shadows are tinted to the ground. A pure-black shadow on a light ground reads as dirt.

Cards are used only when elevation communicates real hierarchy. Otherwise group with
whitespace or a hairline. A page chopped into identical rounded cards is the single most
common way an interface looks generated.

## 4. RTL

Built with **CSS logical properties throughout**: `margin-inline-start`, `padding-block`,
`inset-inline-end`, `border-inline-end`. Not a mirrored stylesheet, and not `[dir=rtl]`
override blocks, which double the surface area for every future layout bug.

`dir` is set on `<html>`. Mixed-script runs carry their own `lang` and `dir` so a screen
reader does not read Arabic in an English voice.

### What mirrors and what does not

Getting this wrong is the most common RTL error, and the 3D row is the one people miss.

| Mirrors | Does not mirror |
|---|---|
| Page layout, navigation, chevrons, back arrows | **The 3D scene and the mannequin.** A garment is a physical object, and a mirrored garment is a wrong garment |
| Progress bars, sliders, carousel direction | **Rotation gestures.** Drag left still spins left. The gesture maps to physics, not to reading order |
| Text alignment, list markers, form layout | Play, pause, and media transport icons |
| Icons that indicate direction | Logos, photography, and the digits in prices |
| Page transition direction | Checkmarks, warning glyphs, brand marks |

## 5. Components

Specifications, not implementations. Every component uses tokens and passes the pre-flight
check in [`README.md`](README.md).

### Button

Three variants: primary (accent fill), secondary (hairline, no fill), quiet (text only).
**One primary per screen.**

- Minimum 44px tall, and never narrower than its label needs. A CTA that wraps to two lines
  at desktop is broken.
- Label is 1 to 3 words and says what happens. "Add to cart", not "Submit".
- Press state is `scale(0.98)` over `--dur-press`. It never shifts layout.
- Loading state disables the button and shows progress in place. It never removes the label,
  because a button that changes width mid-tap moves under the finger.
- Text contrast against its own fill is verified in both themes.

### Input

- **Visible label above the field.** Never placeholder-as-label.
- Helper text present in markup even when empty, so revealing it does not shift layout.
- Validate on blur, not per keystroke.
- Error below the field, with `role="alert"`, stating cause and fix.
- `inputmode` and `autocomplete` set so the right keyboard appears and autofill works. A
  phone field that opens a full keyboard costs conversions on a COD flow.
- Minimum 44px tall. 16px text minimum, or iOS zooms the page on focus.

### Garment card

The most repeated element in the product, so its restraint sets the tone of the whole
catalog.

- Image on a `--stage` ground, exact aspect ratio reserved. No layout shift on load.
- Name, then price. Price is `.numeric`.
- Out of stock carries a label, not only a gray wash.
- Whole card is one tap target. No nested buttons.
- No badge, ribbon, or overlay pill on the image. The image is the merchandise.

### Viewer

- Stage is `--stage`, full bleed, radius 0. Nothing decorative enters it.
- Controls sit outside the stage, never floating over the garment.
- Sticky bottom bar carries the one primary action, "Add outfit to cart", and clears the
  safe area.
- Size selector is a segmented control. Changing size is a vertex blend with no network
  request, so it must feel instant and must not show a loading state.
- Tier C, the sprite turntable, uses the same controls and the same layout. The rendering
  degrades; the product does not.

### Sheet

Rises from its trigger, scrim at `--scrim`, `--dur-sheet`. Dismissible by swipe down, by
the close control, and by Escape. Confirms before dismissing with unsaved changes.

### Skeleton, empty, error

Every surface has all three. This is the state most often skipped and most often seen.

- Skeleton after 300ms, never a spinner over content. It reserves the final aspect ratio.
- Empty states invite an action: "Add your first piece".
- Error states state cause and recovery and offer a retry.

## 6. Icons

Phosphor, `@phosphor-icons/react`, `weight="regular"` globally. One family, one weight.

- Never hand-roll an SVG icon. If a glyph is missing, compose from primitives or add a
  second library deliberately.
- Never an emoji as an icon. They render differently on every platform and cannot be themed.
- Icon-only controls carry an accessible label.
- Sizes come from tokens. Not 20px here and 22px there.
