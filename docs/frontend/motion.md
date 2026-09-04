# Motion

Motion here has one job: **to make cloth feel like cloth.** Everything else is quiet.

A storefront where every card slides and every section fades reads as a template, and it
competes with the merchandise for attention. Talla spends its motion budget in one place so
that the one place lands.

Tokens are in [`tokens.css`](tokens.css).

---

## 1. Rules

**Every animation must be justifiable in one sentence** as hierarchy, storytelling,
feedback, or state transition. "It looked good" is not one of the four. If you cannot write
the sentence, delete the animation.

- Animate `transform` and `opacity` only. Never `width`, `height`, `top`, or `left`. They
  force layout and are the direct cause of the dropped frames the performance budget
  forbids.
- Exits run at roughly 65% of their enter duration. At parity they feel sluggish.
- Enter decelerates (`--ease-enter`), exit accelerates (`--ease-exit`).
- Nothing blocks input. Every animation is interruptible, and a tap during one cancels it
  immediately.
- No infinite loops on informational content.
- `will-change` only on elements that are actually about to animate.
- Never `window.addEventListener('scroll')`. Use `useScroll`, IntersectionObserver, or CSS
  scroll-driven animations.
- Continuous values (pointer, scroll, rotation, drag) never pass through React state. Use
  Motion values or the Three.js loop.

## 2. The one orchestrated moment: the drape settle

When a buyer taps a garment, the mannequin does not cross-fade and the mesh does not pop.
**The garment falls onto the body and settles**, over `--dur-drape`, 380ms.

### Why this is the right thing to spend on

It is nearly free, and it is not reproducible by adding an animation library.

The Dress Solver already simulates cloth falling to rest. It currently keeps the final
frame and discards the rest. Keep **the last 12 frames as quantized vertex deltas**, a few
kilobytes beside a mesh that is hundreds, and play them on load.

The result is a swap that reads as fabric landing rather than as a texture changing,
produced by physics the pipeline already ran. A competitor who adds a fade gets a fade.

### Rules

- Interruptible. Tapping another garment mid-settle cancels immediately and begins the next.
- The viewer stays interactive throughout. Rotation during a settle is allowed and looks
  correct, because the settle is vertex animation and rotation is camera.
- **The mannequin never animates.** Only the cloth. A moving body reads as a character; a
  still body reads as a form, and a form is what a buyer projects themselves onto.
- Under reduced motion, the garment jumps to its final pose. It still appears.

## 3. Everything else

| Surface | Motion | Justification |
|---|---|---|
| Catalog grid entrance | `--stagger-grid` 40ms, opacity plus 8px rise, once per page load, not on scroll | Storytelling: establishes reading order once, then gets out of the way |
| Garment card press | `scale(0.98)`, `--dur-press` | Feedback: acknowledges the tap within 100ms |
| Goes-with strip | Slides in from the inline-end after the settle resolves, `--dur-enter` | Hierarchy: it arrives after the garment, so it reads as a consequence of it |
| Size change | Vertex blend across the morph target, 200ms | State transition: shows that the same garment changed size, rather than that a new garment loaded |
| Add to cart | Cart count ticks, brief check on the button | Feedback. No flying item. The item is already where the buyer is looking |
| Sheets and modals | Rise from the trigger's position, scrim fades, `--dur-sheet` | Spatial continuity: the sheet came from the thing you tapped |
| Page transitions | Forward slides toward the inline-start, back reverses. **Direction follows reading order and flips under RTL** | Storytelling: direction encodes depth |
| Loading | Skeleton at 300ms | Feedback. Never a spinner over content |

**Nothing else moves.** Section reveals on scroll, hover transitions on every card, and
ambient background motion are all absent by design, not by omission.

## 4. Page transitions

The transition never waits on a data fetch. It has a maximum wait and then hands off to a
skeleton. One slow request must not stall a navigation, and tying the reveal to fetch
completion is how that happens.

## 5. Three.js and Motion do not share a tree

They compete for the same frames.

- The viewer is a `'use client'` leaf that owns its canvas and its own loop.
- Page chrome uses Motion and never animates over the canvas while it is mounted.
- The viewer renders **on demand**. A static mannequin renders zero frames; only
  interaction and the settle drive the loop. A continuous `requestAnimationFrame` on a
  still scene is a battery and thermal problem, and a thermally throttled phone misses the
  30fps budget five minutes into a session.
- Every `useEffect` that starts an animation has a cleanup function. No exceptions.

## 6. Reduced motion

`prefers-reduced-motion: reduce` is respected everywhere and **tested**, not assumed.

The principle: **movement is removed, information never is.**

| Normally | Under reduced motion |
|---|---|
| Drape settle | Jumps to the final pose. The garment still appears |
| Grid stagger | None. Everything is present immediately |
| Sheet rise | Opacity only, 60ms |
| Page transition | Instant |
| Card press scale | None. The pressed state is still visually distinct |

A common failure is to gate the *appearance* of content behind a scroll animation, so that
disabling motion leaves the page empty. Content is always in the DOM and always visible;
motion only affects how it arrives.

## 7. Checklist

- [ ] Every animation has its one-sentence justification.
- [ ] `transform` and `opacity` only.
- [ ] Exits shorter than enters.
- [ ] Everything interruptible; nothing blocks input.
- [ ] No scroll event listeners.
- [ ] No continuous values in React state.
- [ ] Every animation `useEffect` has cleanup.
- [ ] Reduced motion tested, and no information disappears with it.
- [ ] Verified at 30fps on the reference device, in the Instagram in-app browser.
