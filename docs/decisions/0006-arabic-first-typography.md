# 0006. Noto Naskh Arabic display, IBM Plex Sans Arabic UI

**Status:** Accepted, revisit at the Phase 0 typography gate
**Date:** 2026-09-04

## Context

The primary market reads Arabic. A UI designed in English and then translated reads
translated, and Arabic readers notice within seconds.

Because the palette is deliberately achromatic ([ADR-0005](0005-achromatic-palette-indigo-accent.md)),
typography is where the brand has to live. There is nowhere else for it to go.

Almost every competing MENA storefront is set in Cairo or Tajawal.

## Decision

- **Display, wordmark and marketing only:** Noto Naskh Arabic.
- **UI and body:** IBM Plex Sans Arabic, with IBM Plex Sans for Latin runs.
- Never below 14px for Arabic body. Line height 1.7 for Arabic, 1.55 for Latin.
- Western Arabic digits for prices by default, tabular, isolated `ltr` inside RTL text.

## Consequences

A naskh display reads as tailoring and heritage rather than as another tech product. That
is the position Talla wants and it separates the brand from the Cairo and Tajawal field.

**Noto Naskh rather than Amiri.** Amiri is the more characterful naskh, but it carries a
devotional association that a clothing brand does not want to inherit. Noto Naskh keeps the
calligraphic structure without it.

**Crossing superfamilies costs metric harmony.** Display and body come from different
families and their metrics do not align. Acceptable only because the display face never
shares a line with body text. If review finds the pairing incoherent, the harmonized
fallback is Noto Sans Arabic for body, trading UI character for metric unity.

Two faces plus their Latin companions is a real font-loading cost on a 4G budget. Mitigated
by loading only the UI regular and medium weights on the critical path; the display face is
marketing-only and never blocks a storefront render.

**This is the one decision here deliberately left open.** It is judged at the Phase 0
typography gate against real garment photography with real Arabic copy at mobile sizes, and
that gate costs a day. Choosing type without seeing it beside the actual merchandise would
be guessing.
