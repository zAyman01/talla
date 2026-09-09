# Implementation and evidence ledger

The user authorized implementation of all phases. Work may prepare later-phase code,
but no release gate is waived. Public reference assets support development only.

| Area | Implemented | Evidence still needed |
|---|---|---|
| Foundation | Workspace, contracts, typed errors, CI, boundaries, pinned CI actions | Keep the full gate green on every change |
| Phase 0 | CIEDE2000 evaluator, reference assets, Arabic inspection UI, mannequin loading measurement | 50 real garments, 3 owners, physical color measurements, reference-phone runs, typography review |
| Styling | Pure ranking, stock/tenant/slot filters, store pins, capped margin tiebreak | Selected-size stock snapshot wired from commerce, pilot feedback |
| Commerce | PostgreSQL quote/checkout, stock locks, idempotency, encrypted buyer records, OTP challenge/token service, WhatsApp reference handoff, real-PostgreSQL concurrency test | HTTP routes, SMS/WhatsApp delivery adapter and shipping operations |
| Tenancy | FORCE RLS migration, connection-scoped transactions and strict host resolution | Owner authentication session and production role provisioning |
| Upload | Network-isolated canonical re-encoding plus slot and quality-gate orchestration | Calibrated gray-card and capture-quality assessor, admin upload route |
| Understanding and solving | Store confirmation preservation only | Segmentation selection, authored tee/jean blocks, drape solver and quality trial |
| Assets and viewer | Budget validation, immutable publish orchestration, reference model inspection and reference-image outfit UI | Real LOD/morph/KTX2 packing, 36-frame layered fallback, garment dressing and physical-phone budgets |
| Storefront | Arabic RTL catalog, size selection, outfit builder, sticky cart action and accessible cart using licensed references | Live catalog HTTP data, verified-phone COD submission and real solved garments |
| Phase 2 | Styling ranker, RLS multi-tenancy, privacy operations and sticky holdout assignment implemented | Owner admin, three live pilots, accessibility audit and device evidence |
| Phase 3 | Not yet started | Pilot-supported pricing, subscriptions/credits, expanded blocks, widget threat model |

The page in `apps/storefront` currently serves a development inspection harness, not a
completed buyer storefront. Its model-load timing is explicitly not time to first garment
dressed. Missing color/owner/device evidence cannot be replaced with reference photos or
synthetic values. `packages/trial/fixtures/pending.json` must fail the trial evaluator.
