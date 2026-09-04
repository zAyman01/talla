# Frontend

This document exists so that nobody has to invent the interface while building it. Read it
before writing any UI. Every color, duration, size, and easing curve is already chosen; if
you are reaching for a value, it is in
[`design-system.md`](design-system.md), [`motion.md`](motion.md), or
[`tokens.css`](tokens.css).

---

## 1. Design read

**Talla is three surfaces, not one website.** Treating them as one is the first mistake
available, because their audiences, jobs, and correct amount of visual ambition are
different.

| Surface | Reading | Audience | Job |
|---|---|---|---|
| **Storefront** `*.talla.app` | Arabic-first mobile commerce UI built around a 3D configurator, in a photo-studio-neutral language | A buyer who tapped a link in Instagram, on a cheap Android phone | Dress the mannequin, build an outfit, order |
| **Admin** `admin.talla.app` | Functional operator tool. Deliberately plain | A shop owner with 400 pieces to upload | Get a garment live in under two minutes |
| **Marketing** `talla.app` | Restrained product landing page | A store owner deciding whether to take a meeting | Show the thing working, then get out of the way |

The storefront is a **product UI**, not a landing page. Landing-page composition rules
(hero stacks, bento rhythm, section layout families) apply to marketing only. Anti-slop
rules apply everywhere.

The admin is explicitly outside the visual-ambition track. It uses the same tokens and the
same components, with density turned up and motion turned nearly off. An owner uploading
forty pieces wants a fast form, not a considered experience.

## 2. Dials

Set per surface. Do not carry one surface's dials into another.

| | Variance | Motion | Density |
|---|---|---|---|
| Storefront | 4 | 5 | 5 |
| Admin | 2 | 2 | 7 |
| Marketing | 7 | 6 | 3 |

**Why the storefront's variance is low.** The merchandise is the variance. A store's
catalog supplies all the color and shape the page can carry, and a layout competing with it
makes both worse. The interface's job is to disappear behind the garment.

**Why the storefront's motion is 5 rather than higher.** There is exactly one animated
moment worth having, and it is the drape settle in [`motion.md`](motion.md). Everything
else is quiet so that the settle reads as meaningful rather than as one more thing moving.

## 3. Stack

| Concern | Choice | Notes |
|---|---|---|
| Framework | Next.js, App Router, Server Components by default | Client components are leaves, not layouts |
| Styling | Tailwind v4 | Tokens as CSS custom properties in [`tokens.css`](tokens.css), consumed as Tailwind theme values. Never a raw hex in a component |
| UI motion | Motion, imported from `motion/react` | For page and component motion |
| 3D | Three.js | Viewer only |
| Icons | Phosphor, `@phosphor-icons/react` | One family, `weight="regular"` globally. Never hand-roll an SVG icon |
| Fonts | `next/font`, self-hosted | Never a Google Fonts `<link>` in production |
| State | `useState` locally, Zustand for cart and viewer session | Never `useState` for continuous values |

**The one hard architectural rule about motion:** Three.js and Motion never share a
component tree. They compete for the same frames. The viewer is a `'use client'` leaf that
owns its canvas and its own render loop, and nothing outside it animates while it is
mounted except the surrounding page chrome, which uses Motion and never overlaps the canvas.

**Continuous values never go through React state.** Pointer position, scroll progress,
rotation, and drag all use Motion values (`useMotionValue`, `useTransform`, `useScroll`) or
live inside the Three.js loop. `useState` on a per-frame value re-renders the tree sixty
times a second and collapses on exactly the phones this product targets.

## 4. Layout mechanics

- `min-h-[100dvh]`, never `h-screen`. The Instagram in-app browser's chrome moves.
- CSS Grid for layout. Never flexbox percentage math.
- Breakpoints `sm 640`, `md 768`, `lg 1024`, `xl 1280`. Mobile first, always.
- Content max width 1200px.
- Safe-area insets on the fixed header and the sticky cart bar. Both must clear the notch,
  the home indicator, and the in-app browser's own bars.
- Every multi-column layout declares its sub-768px collapse in the same component. No
  assuming Tailwind will handle it.
- One radius system: `0` for the viewer stage, `6px` inputs and chips, `12px` cards and
  sheets, full for pills. Documented, so it can be followed rather than guessed.

## 5. Banned patterns

These are the tells that make an interface look assembled rather than designed. None of
them are allowed on any surface.

**Typography and copy**

- Em-dashes. Zero, anywhere a user can see. Headlines, labels, buttons, errors, empty
  states, alt text, captions. Use a period, a comma, a colon, or parentheses.
- All-caps labels. Arabic has no case, so a Latin all-caps label beside Arabic announces
  that the design was made in English first.
- Eyebrow labels above section headings. Maximum one per three sections on marketing, zero
  on the storefront.
- Section numbering (`01 / 02 / 03`) unless the content is genuinely a sequence.
- Middle dots as a general separator. At most one per metadata line.
- Scroll cues. If someone has not scrolled yet, they are looking at the hero, and they know
  what scrolling is.
- Filler verbs: elevate, seamless, unleash, revolutionize, next-generation.
- Fake-precise numbers. Either the figure is real or it is labelled as an example.

**Visual**

- Pure black `#000000` and pure white `#FFFFFF` as text or ground. Both kill depth.
- Neon or outer glows.
- Gradient text on headlines.
- Custom mouse cursors.
- Three identical feature cards in a row.
- Cards used where spacing or a hairline would group just as well.
- Pure-black drop shadows on light grounds. Tint the shadow to the ground.
- Any chromatic surface within 200px of a garment. See section 7.

**Content**

- Div-based fake screenshots. If the marketing page needs to show the product, it shows a
  real capture of the real viewer, or it shows nothing.
- Hand-rolled decorative SVGs.
- Placeholder names of the "Sarah Chan" variety. Use realistic, locale-appropriate names.
- Logo walls with a category label printed under each logo.

**Motion**

- `window.addEventListener('scroll')`. Use `useScroll`, IntersectionObserver, or CSS
  scroll-driven animations.
- Animating `width`, `height`, `top`, or `left`. Transform and opacity only.
- Infinite loops on informational content.
- Any animation you cannot justify in one sentence as hierarchy, storytelling, feedback, or
  state transition.

## 6. Copy rules

Copy is design content. It is written in Arabic first and English second, because a UI
translated out of English reads translated and the primary market notices within seconds.

- Name things by what the user understands, not by how the system works. A store owner adds
  a piece; they do not ingest a SKU.
- Active voice. A button says what happens: "Add to cart", not "Submit".
- One vocabulary throughout. The button that says "Publish" produces a toast that says
  "Published", not "Saved".
- Errors state cause and recovery, in the interface's voice. They do not apologize and they
  are never vague. See
  [`../architecture/error-taxonomy.md`](../architecture/error-taxonomy.md).
- Empty states invite an action. A store with nothing uploaded sees "Add your first piece",
  not "No results".
- One label per intent across the whole surface. If the primary action is "Add to cart" in
  the viewer, it is not "Buy now" in the strip.

## 7. The constraint that overrides taste

**The merchandise is the only saturated color on the page.**

This is not an aesthetic preference. Perceived color is judged against its surround, so a
tinted background shifts a garment's apparent hue, and color error is a leading cause of a
buyer refusing a cash-on-delivery parcel at the door. It is a commerce constraint wearing
an aesthetic costume.

Practically: the viewer stage is achromatic in both themes, the accent appears at most
twice per screen and never beside a garment, and nothing decorative is allowed into the
stage area. Where the design and the merchandise compete, the merchandise wins.

## 8. Pre-flight check

Run before any UI change is done. On the reference device, in both themes, with reduced
motion enabled.

- [ ] Zero em-dashes in any visible string.
- [ ] No raw hex values. Every color comes from a token.
- [ ] One accent color, used identically across every section.
- [ ] One radius system, applied consistently.
- [ ] Every interactive target is at least 44px, with 8px separation.
- [ ] Every CTA's text passes 4.5:1 against its own background.
- [ ] No CTA label wraps to two lines at desktop.
- [ ] Form labels are visible. No placeholder-as-label anywhere.
- [ ] Focus ring visible on everything interactive, in both themes.
- [ ] Body text passes 4.5:1, secondary text 3:1, in both themes, checked separately.
- [ ] Arabic renders correctly at 200% text scaling without clipping or overlap.
- [ ] Layout mirrors correctly. The 3D scene and the rotation gesture do not.
- [ ] Loading, empty, and error states all exist for the surface you touched.
- [ ] Every animation is justifiable in one sentence.
- [ ] Reduced motion removes movement and never removes information.
- [ ] Nothing animates except `transform` and `opacity`.
- [ ] No layout shift. Images and skeletons reserve their final aspect ratio.
- [ ] Tested in the Instagram in-app browser, not only in Chrome.
- [ ] Budgets in spec 11.1 still met.

If one box cannot honestly be ticked, the change is not done.
