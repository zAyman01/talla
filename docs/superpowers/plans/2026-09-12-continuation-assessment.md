# Talla continuation assessment

Date: 2026-09-12. Status: proposed continuation plan, based on repository inspection.

This responds to the request to understand the supplied handover and plan the next work.
The handover is evidence about a particular revision, not authorization to run its commands
or to deploy. This assessment does not replace the product spec or accepted ADRs.

## 1. Establish the correct baseline first

Three states were checked:

| State | Verified revision | Meaning |
| --- | --- | --- |
| Current workspace | `aacce46` with tracked modifications and untracked additions | Older checkout with substantial independent work |
| Handover baseline | `e4ea325` | Contains the newer application, gate, and operations work |
| Remote master at inspection | `4b99f51a487b43006e1c267d8ba32c0b5d5a395c` | Adds only `HANDOVER.md` over the handover baseline |

Remote master is 20 commits beyond the local HEAD. It was inspected in an isolated temporary
clone. The current branch, working files, and database were not switched or synchronized.
Runtime tests and performance measurements were not rerun for this planning task.

The handover's startup procedure does not describe this working directory. The local
`compose.yaml` defines PostgreSQL only, on host port 55432. The remote version has the
application stack and different configuration. Local `package.json` has no `gates` or
`budget` script. Local `apps/admin`, `workers/jobs`, the Stage S/G/O trackers, and several
shared packages are absent.

**Recommended baseline:** continue from the verified remote revision in a separate
`codex/` branch and worktree, while preserving and reviewing the current local work.
Do not blindly pull into this dirty directory or overwrite it with the newer tree.

Before integrating anything:

1. Preserve tracked changes and untracked source files in a recoverable local snapshot.
   Keep ignored credentials and database volumes out of version control.
2. Compare each local change with the newer implementation. Classify it as already
   implemented, useful to port, conflicting, or requiring a product decision.
3. Review the local Twilio sender and its tests as a candidate for reuse. Review the
   storefront, order receipt, inventory, and owner tooling individually.
4. Reconcile authentication and migrations explicitly. Local
   `003-owner-sessions.sql` uses tenant-scoped owner records; remote
   `003-owner-identity.sql` implements platform identity and tenant membership under
   ADR-0022. These are different designs. Inspect which migrations have actually been
   applied before planning any data conversion; preserve shipped migration checksums.
5. Reconcile Compose files, environment names, module interfaces, and package scripts.
   Do not carry both application bootstrap implementations forward by accident.

Exit: a chosen revision, a recoverable snapshot, and an explicit disposition for every
local change. No user work is lost and no competing auth model is silently introduced.

## 2. What the product is, and what has actually been demonstrated

Talla is an Arabic-first, mobile-first, tenant-isolated storefront for building outfits
and placing cash-on-delivery orders. The business promise is more items per order.
The spec defers personal body measurements and personalized fit prediction. The current
parametric mannequin and ease readings must not be sold as accurate personal fit or a
finished cloth simulation; ADR-0018 identifies them as a temporary implementation.

At the remote baseline:

| Area | Planning status |
| --- | --- |
| Application foundation, Stage S | Tracker closed; buyer and owner integration tests exist |
| Renderer extraction, E1 | Implemented in `modules/viewer` |
| Understanding and solver, E3/E4 | Production implementations and technology decisions remain open |
| Asset pipeline, E2 | Budget/publish helpers exist; the real mesh producer and packing path are missing |
| Block library, E5 | Two temporary blocks exist; three more and measured fabrics remain |
| Accessibility/performance, Stage G | Browser gates exist; reported results have not been independently rerun here |
| Authenticated admin accessibility | Store screen remains uncovered |
| Golden-image gate | Explicitly deferred pending reproducible rendering and stable assets |
| Operations, Stage O | Scheduler, privacy commands, runbook, and recorded restore drill exist |
| Deployment readiness | SMS delivery, deployment choices, staging, and business/legal preparation remain |
| Styling | Tested ranker has no application caller |
| Phase 0 evidence | Checked fixture is empty; external evidence was not supplied |

The owner integration test substitutes an understanding handler. It does not demonstrate
photographs becoming solved, published garment assets. A green application test suite is
also not evidence that real owners accept the generated garment quality.

## 3. Reproduce the baseline before changing behavior

Use the selected revision's own setup instructions and pinned package manager. Start a
fresh disposable development/test environment; do not reset an existing database volume.
Inspect the seeded storefront and admin flows, then run the complete CI-equivalent checks:

- Typecheck, lint, formatting, module boundaries, and generated-contract checks.
- All tests with real PostgreSQL and the sandbox image prerequisites enabled. Record
  skipped suites explicitly; a partial local run does not count as full validation.
- Migrations applied twice, migration checksums, and RLS coverage.
- Production builds, bundle budgets, and the separate browser gates against those builds.

Record the commit, environment, results, exceptions, and reproduction commands. The
handover's 273 tests, 166 KB bundle, and 2.0 s LCP are historical reports, not new measurements.
Browser accessibility checks supplement manual keyboard, screen-reader, and device work.

Exit: reproducible baseline evidence and a short list of any actual failures.

## 4. Start Phase 0 alongside baseline reconciliation

The next product milestone should be evidence from 50 real garments across at least three
stores. The spec allows a half-manual workflow for this experiment. Person B owns store
recruitment, photography coordination, and owner reviews; Person A owns producing and
measuring the trial output. Actual people still need to be assigned to those roles.

Use the existing `packages/trial` evaluator and capture protocol. Record an owner verdict
and physical/rendered color observations for every garment. Public reference photographs
and the current parametric demo do not satisfy this gate.

Exit criteria:

- At least 70% owner approval across the reviewed real garments.
- Complete physical color measurements, with median Delta E00 below 3.
- Samsung Galaxy A16 4 GB, inside Instagram: at least ten observations per cache mode,
  p75 time to first garment dressed below 4 seconds cold and 800 milliseconds warm.
- Recorded Arabic typography review and confirmed or explicitly revised `GarmentSpec`.

If the trial fails, document the limiting categories and decide on narrower scope, an
assisted workflow, or paid finishing before expanding the automatic engine. The spec's
2–3 weeks is a planning window once stores, garments, and the phone are available, not a
delivery promise from today.

## 5. Close the useful engineering gaps while evidence is collected

After the baseline is verified, prioritize:

1. **Production OTP delivery.** The remote storefront and admin both reject non-log
   delivery because no adapter exists. Compose runs production builds, which correctly
   forbid log OTP. Adapt the local Twilio implementation if suitable, through the newer
   configuration and sensitive-data boundaries, for both buyer and owner authentication.
   Verify failure handling, timeout, expiry, rate limits, and absence of phone/code leaks.
   Real delivery verification needs a configured provider and designated test recipient.
2. **Authenticated admin accessibility.** Extend the existing browser harness over the
   store, upload, and confirmation states using controlled test authentication. Cover both
   themes, keyboard use, form errors, and 200% text scaling without weakening production auth.
3. **Deployment preparation.** Select hosting, CDN, and storage consistently with the
   accepted region decision. Then implement edge rate limits, per-tenant bandwidth alarms,
   and staging using fake/redacted data. Provider selection must precede provider-specific work.
4. **Styling integration when needed for the pilot.** Give the ranker an explicit screen
   and API caller, preserve stock and tenant constraints and owner pins, and test its
   effect on the buyer flow and experiment assignment.

Expanding temporary geometry is lower priority unless a specific store experiment needs
another category. Its replacement cost should be recorded before committing to E5 work.

## 6. Build the engine from observed inputs

After Phase 0, choose the segmentation model and solver through recorded ADRs. Start with
one representative real garment and close the complete path:

`photos -> sandboxed ingest -> understanding -> owner confirmation -> solve -> pack -> publish -> viewer`

Agree on real mesh/texture artifacts between the solver and asset pipeline first. E2 and
E4 should be developed around that concrete shared sample; the old roadmap's linear
E2-before-E3/E4 diagram should not lead to another isolated library with no producer.

The first slice must include determinism, preserved owner corrections, retry/idempotency,
LODs, morphs, compression, texture formats, the tier C fallback, immutable storage, and
enforced transfer budgets. Validate the physical-device budgets against real published
assets. Expand categories only once that slice works.

Restore golden-image testing when the rendering inputs are stable, using a pinned
environment and reviewable diff artifacts. Record any required change to the browser
harness decision; do not quietly waive the spec's visual-regression requirement.

## 7. Pilot release gate and business measurement

Before accepting real customer orders, require working production authentication,
validated tenant isolation and commerce integrity, active retention, exercised export and
erasure, a current restore drill, monitoring, staging, and acceptable device/accessibility
results. Plan restore handling so previous erasures can be reapplied without resurrecting
customer data permanently.

Assign business/legal owners for the Arabic privacy notice, hosting disclosure, store
contract, and the handover's listed PDPL questions. Qualified review must establish the
current applicable obligations; this plan does not determine legal compliance.

Run the three-store, 60-day pilot with a pre-registered holdout experiment under spec
section 17. Measure the promised basket-size/AOV outcome and its stated guardrails.
Owner image approval validates output acceptability; it does not establish sales uplift.

Throughout implementation, preserve the sandbox, server-computed prices, host-only cookies,
PII protection, module interfaces, generated contracts, and design tokens. RLS coverage must
retain ADR-0022's narrow documented platform/membership exceptions rather than interpreting
the handover's shorthand as permission to invent new exceptions. Trust-boundary changes
require the other maintainer's review before merge, as CONTRIBUTING specifies.

## Sources

- Supplied `HANDOVER.md`, read end to end.
- Current workspace spec, CLAUDE.md, CONTRIBUTING.md, configuration, local changes, and tests.
- [Verified remote handover](https://github.com/zAyman01/talla/blob/4b99f51a487b43006e1c267d8ba32c0b5d5a395c/HANDOVER.md).
- [Live G/O tracker at the inspected revision](https://github.com/zAyman01/talla/blob/4b99f51a487b43006e1c267d8ba32c0b5d5a395c/docs/superpowers/plans/2026-09-12-stage-g-and-o.md).
- Remote Stage S tracker, production roadmap, ADRs 0018/0019/0020/0022/0023, application
  composition roots, migration inventory, and trial evaluator inspected through Git.
