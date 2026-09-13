# Talla · طلّة

**See the whole look.** · **شوف طلّتك قبل ما تشتري**

A hosted storefront for small and medium clothing stores in MENA. A store uploads photos
of a garment; Talla turns it into a 3D garment worn by an on-page mannequin. Buyers browse
the catalog, dress the mannequin, build complete outfits, and order.

The product sold to the store owner is **basket size**, not fit. A buyer who builds an
outfit buys three pieces instead of one.

---

## Status

The buyer storefront, owner application, protected commerce path, browser gates, and
operations tooling are implemented as a production MVP. Real garment solving and pilot
evidence remain gated on store photography, authored garment blocks, and measurements
from the reference phone.

The design is specified in full in
**[the spec](docs/superpowers/specs/2026-09-04-talla-design.md)**: product, architecture,
security, performance, design system, motion, accessibility, and build order across 24
sections.

Implementation documentation is indexed in **[`docs/`](docs/README.md)**.
The authority order for the spec, schema, tokens, and decisions is recorded in
[`ADR-0015`](docs/decisions/0015-documentation-authority-and-contracts.md).

## Run locally

Docker, Node.js 24 or newer, and pnpm 11 or newer are required.

```sh
pnpm install
cp .env.example .env
cp .env.sms.example .env.sms
docker compose up -d --wait
docker compose run --rm seed
```

Open `http://nasij.localhost:3000` for the seeded store and
`http://admin.localhost:3001` for owner sign in. The production images use Twilio when
`TALLA_OTP_CHANNEL=sms`; replace the four placeholders in `.env.sms` to exercise real
delivery. Only storefront and admin receive that file. To use log OTP in local development,
run `node scripts/dev.ts storefront` or
`node scripts/dev.ts admin` on the host. Production rejects log OTP by design.

## The shape of it

| | |
|---|---|
| **Market** | Small clothing stores in MENA selling through Instagram and WhatsApp |
| **Promise** | More items per order, measured against a held-out control |
| **Runtime target** | Mid-range Android, 4G, inside the Instagram in-app browser |
| **Interface** | Arabic-first, RTL, mobile-first, achromatic so garment color reads true |
| **Model** | Subscription plus SKU credits. Cash on delivery, no commission |

## Governing constraints

Four sentences that decide most arguments before they start.

- **All expensive computation happens once, at upload.** A buyer click loads cached
  geometry and nothing else.
- **Bandwidth is the cost driver**, not compute or storage. Asset budgets are commercial
  terms, not engineering preferences.
- **Tenant isolation is enforced in the database**, never only in application code.
- **If a feature is not required to complete a cash-on-delivery order, it waits.**

## Where to start

| If you are | Read |
|---|---|
| New here | [The spec](docs/superpowers/specs/2026-09-04-talla-design.md), sections 1 to 4 |
| Writing UI | [`docs/frontend/README.md`](docs/frontend/README.md) |
| Writing backend or pipeline code | [`docs/architecture/overview.md`](docs/architecture/overview.md) |
| Asking why something is the way it is | [`docs/decisions/`](docs/decisions/README.md) |
| Contributing | [`CLAUDE.md`](CLAUDE.md) and [`CONTRIBUTING.md`](CONTRIBUTING.md) |

## License

Not yet licensed. All rights reserved.
