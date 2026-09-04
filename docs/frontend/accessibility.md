# Accessibility

Target: **WCAG 2.2 AA**.

This is a storefront. An inaccessible one silently loses the store money it never learns
about, which is the argument that matters to the person paying for Talla.

Two things make this harder than a typical checklist, and both are load-bearing here: the
primary interface is a `<canvas>`, and the primary language is Arabic.

---

## 1. The canvas problem

A WebGL viewer is a hole in the accessibility tree. Everything below exists to close it.

- **Every garment has a text description generated from its `GarmentSpec`**: category,
  color name, sleeve, neckline, fit. A screen reader user gets "relaxed crew neck tee, short
  sleeve, deep maroon, cotton jersey", not "canvas".
- **The outfit has a live description.** When the buyer adds a bottom, an `aria-live`
  region announces the outfit as it now stands. The mannequin's state is the product state,
  so it has to be readable.
- **Keyboard controls exist for rotation and size.** Arrow keys rotate, a segmented control
  changes size. A canvas with pointer-only controls is a dead zone.
- **Price, stock, and size are text**, never rendered into the canvas and never shown only
  as an image.
- The canvas carries `role="img"` with a label when it is non-interactive, and proper
  labelled controls when it is.

Tier C, the sprite turntable, has the same obligations and meets them the same way.

## 2. The Arabic problem

- **Text scaling to 200% without clipping or overlap.** Arabic at large sizes is the case
  most likely to break a layout, because line height and diacritics grow together. Test it
  deliberately; do not assume Latin testing covers it.
- **Never below 14px** for Arabic body text. Arabic loses legibility faster than Latin.
- **`lang` and `dir` are correct per element** on mixed-script content, so a screen reader
  does not read Arabic in an English voice or announce a Latin brand name as Arabic.
- **Prices are isolated** with `direction: ltr` and `unicode-bidi: isolate` inside RTL
  text, so the currency symbol does not jump sides.
- **Logical properties throughout**, so mirroring is structural rather than patched.

## 3. Contrast

Verified **separately in each theme**. Light-mode values do not transfer to dark.

| Element | Minimum |
|---|---|
| Body text | 4.5:1 |
| Large text, 18px and above | 3:1 |
| Meaningful icons and UI boundaries | 3:1 |
| Focus ring against both the component and its ground | 3:1 |
| Form placeholders, helper text, error text | 4.5:1 |

Every CTA's label is checked against its own fill, not against the page. A white-on-white
button is the most common contrast failure and the easiest to miss in a screenshot.

`--ink-faint` is decorative. It never carries sole meaning.

## 4. Color is never the only signal

- Out of stock carries a label, not just a gray wash.
- Errors carry an icon and text, not just red.
- Selected states carry a shape or weight change, not just an accent tint.

Roughly one in twelve men cannot separate the pair you picked, and a storefront's buyers
are not a filtered population.

## 5. Keyboard

**The entire purchase path works without a pointer.** Browse, dress, layer, choose a size,
add to cart, order.

- Visible focus ring on everything interactive, in both themes, never removed.
- Tab order matches visual order, which under RTL means it follows the mirrored layout.
- Sheets and modals trap focus, return focus to the trigger on close, and close on Escape.
- After a route change, focus moves to the main content region.
- After a failed submit, focus moves to the first invalid field.
- No keyboard trap in the canvas. Tab enters it, Tab leaves it.

## 6. Touch

- Minimum 44px targets, 8px apart. Expand the hit area rather than growing the icon.
- Clear of the notch, the home indicator, and the Instagram in-app browser's own chrome.
- Zoom is never disabled. `maximum-scale=1` is not permitted.
- Feedback within 100ms of every tap.
- No gesture-only action. Anything reachable by swipe is also reachable by a visible control.

## 7. Forms

- Visible label above every field. Never placeholder-as-label.
- Helper text in markup even when empty, so revealing it does not shift layout.
- Validate on blur. Error below the field, `role="alert"`, stating cause and fix.
- Required fields marked in text, not only with an asterisk color.
- `inputmode`, `autocomplete`, and `type` set correctly. On a COD checkout this is an
  accessibility control and a conversion control at once.
- Multiple errors get a summary at the top with anchors to each field.

## 8. Motion

`prefers-reduced-motion: reduce` is respected everywhere. **Movement is removed;
information never is.** See [`motion.md`](motion.md) section 6.

The failure to avoid: gating content's appearance behind a scroll animation, so that
disabling motion leaves an empty page. Content is always in the DOM and always visible.

## 9. Testing

Automated checks catch perhaps a third of this. The rest is manual.

**Every UI change**, on the reference device:

- [ ] Keyboard only, through the whole flow you touched.
- [ ] Both themes, contrast checked separately.
- [ ] Reduced motion on, confirming nothing disappeared.
- [ ] Text scaling at 200%, in Arabic.
- [ ] axe or equivalent, zero violations.

**Every release:**

- [ ] Screen reader pass on the purchase path, in Arabic, with a real screen reader.
- [ ] Both text directions, on a real device.
- [ ] The Instagram in-app browser, which is where the buyers are.
