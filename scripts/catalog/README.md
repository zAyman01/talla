# Demo catalog provenance

The local `nasij` tenant is branded **طلّة / Talla** and is seeded from
`demo-catalog.json`. The catalog snapshot was prepared on 2026-09-14 from the public
product feeds and pages at:

- <https://faridstore.site/>
- <https://clother-wear.com/>

The 140 local WebP files in `apps/storefront/public/catalog` are optimized display copies
of the public color-level product images. They total about 4 MB, are capped at 900 × 1100,
and keep the storefront independent of third-party availability and CSP exceptions.

Farid's three supplied charts are transcribed exactly into the snapshot. Clother chart
values are preserved as strings, including ranges and visible source anomalies. Horizontal
flat-garment values are never silently treated as body circumference. Where a chart did not
print its unit, the note from the source snapshot remains visible in the storefront.
