# Implementation and evidence ledger

The user authorized implementation of all phases. Work may prepare later-phase code,
but no release gate is waived. Public reference assets support development only.

| Area | Implemented | Evidence still needed |
|---|---|---|
| Foundation | Workspace, contracts, typed errors, CI, boundaries, pinned CI actions | Keep the full gate green on every change |
| Phase 0 | CIEDE2000 evaluator, reference assets, Arabic inspection UI | 50 real garments, 3 owners, physical color measurements, reference-phone runs, typography review |
| Styling | Pure ranking, stock/tenant/slot filters, store pins, capped margin tiebreak | Selected-size stock snapshot wired from commerce, pilot feedback |
| Commerce | PostgreSQL quote/checkout, stock locks, idempotency, encrypted buyer records, OTP challenge/token service, WhatsApp reference handoff, real-PostgreSQL concurrency test, and HTTP routes for quote, phone and orders | SMS/WhatsApp delivery adapter and shipping operations |
| Tenancy | FORCE RLS migration, connection-scoped transactions, strict host resolution, owner phone OTP with platform-level identity and PostgreSQL sessions (ADR-0022) | Production role provisioning and an OTP delivery adapter |
| Upload | Network-isolated canonical re-encoding, slot orchestration, and an admin upload screen that enqueues the pipeline | Calibrated gray-card and capture-quality assessor |
| Blocks | Parametric mannequin graded across six sizes, tee and jean blocks with ease profiles, per-vertex cloth clearance, fit readings in centimetres (ADR-0018) | Artist-authored blocks, UV layouts, real fabric presets |
| Understanding and solving | Store confirmation preservation only | Segmentation selection, drape solver and quality trial. Nothing in the block library simulates cloth |
| Assets and viewer | Budget validation, immutable publish orchestration, and a viewer that dresses the mannequin: layering by slot, body size as a vertex blend, drape settle, render on demand, context-loss fallback to photographs | Real LOD/morph/KTX2 packing, 36-frame tier C turntable, textures, and physical-phone budget runs |
| Storefront | Arabic RTL home page built around the mannequin, now rendered per request from the store the host names: catalogue, stock and merchandise colour all read from PostgreSQL | Real solved garments, and a buyer-facing checkout form wired to the order route |
| Phase 2 | Styling ranker, RLS multi-tenancy, privacy operations, sticky holdout assignment, and an owner admin on its own origin | Three live pilots, accessibility audit and device evidence |
| Phase 3 | Not yet started | Pilot-supported pricing, subscriptions/credits, expanded blocks, widget threat model |

Stage S of the production roadmap closed the gap that mattered most: every module was a
tested library with no caller, and `apps/storefront/test/end-to-end.test.ts` now takes a
buyer from a subdomain to an encrypted cash-on-delivery order through the real ones.

The home page in `apps/storefront` dresses a mannequin, but it dresses it in parametric
blocks, not in solved garments (ADR-0018). Nothing there is evidence: no timing taken on it
is TTFD, because there is no asset to fetch and no cloth was simulated, and the fit readings
describe a block rather than a garment a store owns. Missing color, owner and device
evidence cannot be replaced with reference photos or synthetic values.
`packages/trial/fixtures/pending.json` must fail the trial evaluator.

`/lab` remains a reference-asset inspection harness. It keeps the licensed CC0 model and
the reference photographs, which is its job: reviewing what was downloaded, its provenance,
and its color. The buyer surface no longer uses either.
