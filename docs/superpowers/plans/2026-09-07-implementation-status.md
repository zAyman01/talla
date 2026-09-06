# Implementation and evidence ledger

The user authorized implementation of all phases. Work may prepare later-phase code,
but no release gate is waived. Public reference assets support development only.

| Area | Implemented | Evidence still needed |
|---|---|---|
| Foundation | Workspace, contracts, typed errors, CI and boundaries | Re-run all checks after this implementation |
| Phase 0 | CIEDE2000 evaluator, reference assets, Arabic inspection UI, mannequin loading measurement | 50 real garments, 3 owners, physical color measurements, reference-phone runs, typography review |
| Styling | Pure ranking, stock/tenant/slot filters, store pins, capped margin tiebreak | Selected-size stock snapshot wired from commerce, pilot feedback |
| Commerce | PostgreSQL quote/checkout, locks, duplicate submission protection, encrypted buyer records | HTTP integration, phone provider, shipping operations, concurrent real-PostgreSQL test |
| Tenancy | FORCE RLS migration and connection-scoped transactions | Authenticated request resolution and production roles |
| Upload | Not yet implemented | Sandboxed re-encoding, gray-card assessment, capture controls |
| Understanding and solving | Store confirmation preservation only | Segmentation selection, authored tee/jean blocks, drape solver and quality trial |
| Assets and viewer | Budget validation and reference model inspection | Real LOD/morph/KTX2 packing, 36-frame layered fallback, garment dressing and physical-phone budgets |
| Phase 2 | Not yet complete | Owner admin, pilots, privacy operations, holdout instrumentation, accessibility/device evidence |
| Phase 3 | Not yet started | Pilot-supported pricing, subscriptions/credits, expanded blocks, widget threat model |

The page in `apps/storefront` currently serves a development inspection harness, not a
completed buyer storefront. Its model-load timing is explicitly not time to first garment
dressed. Missing color/owner/device evidence cannot be replaced with reference photos or
synthetic values. `packages/trial/fixtures/pending.json` must fail the trial evaluator.
