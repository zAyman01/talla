# Talla — طلّة

**See the whole look.** · **شوف طلّتك قبل ما تشتري**

A hosted storefront for small and medium clothing stores in MENA. A store uploads photos
of a garment; Talla turns it into a 3D garment worn by an on-page mannequin. Buyers browse
the catalog, dress the mannequin, build complete outfits, and order.

The product sold to the store owner is **basket size**, not fit. A buyer who builds an
outfit buys three pieces instead of one.

---

## Status

Design stage. Nothing is built yet.

The design is specified in full — architecture, security, performance, design system,
motion, accessibility, and build order — in:

**[`docs/superpowers/specs/2026-09-04-talla-design.md`](docs/superpowers/specs/2026-09-04-talla-design.md)**

Start at section 1 for the product, section 5 for the architecture, or section 21 for what
changed between revisions.

## The shape of it

| | |
|---|---|
| **Market** | Small clothing stores in MENA selling through Instagram and WhatsApp |
| **Promise** | More items per order, measured against a held-out control |
| **Runtime target** | Mid-range Android, 4G, inside the Instagram in-app browser |
| **Interface** | Arabic-first, RTL, mobile-first, achromatic so garment color reads true |
| **Model** | Subscription plus SKU credits. Cash on delivery, no commission |

## Governing constraints

- All expensive computation happens once, at upload. A buyer click loads cached geometry.
- Bandwidth is the cost driver, not compute or storage.
- Tenant isolation is enforced in the database, never only in application code.
- If a feature is not required to complete a cash-on-delivery order, it waits.

## License

Not yet licensed. All rights reserved.
