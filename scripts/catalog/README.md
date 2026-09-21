# Demo catalog provenance

The local `nasij` tenant is branded **طلّة / Talla** and is seeded from
`demo-catalog.json`. Run `pnpm catalog:sync` to rebuild the snapshot from the public
Shopify feeds at:

- <https://faridstore.site/>
- <https://clother-wear.com/>

The snapshot contains one record per real product page: currently 3 Farid products and 56
Clother products. It keeps exact titles, prices, compare-at prices, live availability,
source size labels, color options, product URLs, and every published gallery image. The 59
local JPEG cover images in `apps/storefront/public/catalog/products` are capped at 1100 px;
the complete galleries continue to use the original Shopify CDN images.

Previously transcribed size charts are retained when the feed is refreshed. Values remain
strings, including ranges and visible source anomalies. Horizontal flat-garment values are
never silently treated as body circumference. The storefront also displays the exact live
size options separately from the normalized mannequin body sizes.
