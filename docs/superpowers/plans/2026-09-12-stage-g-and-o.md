# Stage G and Stage O — Gates, operations, and law

> Steps use checkbox (`- [ ]`) syntax. Parent:
> [`../specs/2026-09-11-production-roadmap-design.md`](../specs/2026-09-11-production-roadmap-design.md),
> sections 6 and 7.

**Date:** 2026-09-12
**Follows:** [`2026-09-11-stage-s-application-spine.md`](2026-09-11-stage-s-application-spine.md),
which has no open items.

---

## Why these two before Stage E

Stage E's remaining parts are blocked on things this repository cannot decide. E2 has no
producer: `publishBundle` has zero callers and nothing makes mesh bytes. E3 and E4 are
technology choices that spec section 24 deliberately leaves open, to be made from Phase 0
evidence that does not exist yet.

G and O are blocked on nothing. They are also the two stages that must be finished before
a pilot store takes a real order, which E is not: a pilot can run on parametric blocks and
photographs, and cannot run without a retention policy that executes or a storefront a
buyer using a screen reader can get through.

Neither stage moves the Phase 0 number. Nothing in this repository does.

---

## Stage G — The gates

The roadmap's table assigns two gates to E2 (asset budget, golden image) because that was
where the code they measure was expected to arrive. The golden image gate is pulled
forward here: the renderer exists, it moved into `modules/viewer` on 2026-09-12, and a gate
that would have caught a regression in that move is worth more now than after E2. The
asset budget gate stays with E2, because there is still nothing to publish.

### G1. A browser harness

The three remaining gates all need a real browser. Headless WebGL in Node is not close
enough to what a phone does, and an accessibility tree assembled by jsdom is not the one a
screen reader reads.

- [x] Choose the driver and write the ADR. One driver for all three gates or the cost is
      paid three times.
- [x] A harness that points at a running stack rather than starting one, so a gate
      measures the production images and is one command rather than a procedure.
- [x] CI installs the browser and runs the gates. They block merge like everything else.

### G2. Accessibility, WCAG 2.2 AA

Spec 15. The gate fails on any violation, not on a score.

- [x] axe over the storefront: catalogue, an outfit with garments selected, and the
      checkout form with an error showing, because an error state is where forms fail.
- [x] axe over the admin origin's sign in screen, plus a check that no visible input is
      labelled by a placeholder alone. An owner signs in on the same cheap Android a buyer
      browses on, and that screen decides whether they can work at all. The store screen
      is behind a session and is not covered yet.
- [x] The violations found are fixed, or recorded with a reason and a date. A gate that
      ships with an allowlist of known failures is a gate that will grow one.

### G3. Lighthouse, on the throttled reference profile

Spec 11.1. The budgets are LCP under 2.5 s, CLS under 0.1, and the critical path under
180 KB, all at p75 on the reference device over 4G.

- [x] Lighthouse against the production build, throttled to a profile derived from the
      Samsung Galaxy A16 (ADR-0012).
- [x] Budgets asserted as numbers from spec 11.1, not as a performance score.
- [x] TTFD is **not** asserted here. It is time to first garment dressed, it depends on
      assets that do not exist, and a lab number for it today would measure the parametric
      stopgap rather than the product.

### G4. Golden image on the renderer

Spec 16.3. A perceptual diff of the reference mannequin, so a change to the scene that
nobody looks at cannot pass.

**Deferred, 2026-09-12, with the reason.** A committed reference image has to be
reproducible on every machine that runs the gate, and a headless browser draws through
SwiftShader, whose output differs between Windows and Linux by more than a perceptual
threshold can absorb without going blind to real changes. Making it reproducible means
pinning a browser inside a container and rendering only there, which is a fixed Linux
image and a second way to run a browser, against ADR-0023's whole point.

It is worth that cost once there is something stable to photograph. Today the figure is
the parametric stopgap of ADR-0018, which E2 and E4 replace outright, so every reference
image committed now is thrown away with it. The geometry underneath is not unguarded in
the meantime: `modules/blocks/test/mannequin.test.ts` already asserts topology, grading
direction, determinism, and that cloth stays outside the body at every vertex.

- [ ] Render through `createMannequinScene` directly rather than through the page. The
      page decides a device tier first, and a headless browser is a software rasteriser,
      which the ladder correctly sends to tier C. The gate measures the renderer; the
      ladder has its own tests.
- [ ] A committed reference image per body size and garment set, with a perceptual
      threshold rather than an exact match, rendered in a pinned container.
- [ ] A failure writes the actual and the diff somewhere a human can look at them.

---

## Stage O — Operations and law

**Entry gate.** Before the first pilot store takes a real order. Not after.

### O1. The retention scheduler

`applyRetention` is a function with no caller. A retention policy nothing executes is a
policy that will be discovered during an audit.

- [x] A scheduled sweep that runs it per tenant. It runs on a clock in the jobs process
      rather than on the queue: a queued job needs an enqueuer, and a sweep that only runs
      when a job exists stops the first time the enqueuer is misconfigured.
- [x] The retention window is configuration, and required with no default, because spec
      12.7 says define it before the first pilot and a default is Talla deciding a store's
      policy for it.
- [x] It writes to the audit log, which `applyRetention` already does, and every sweep is
      recorded including the ones that erase nothing. Without that row a store with no
      expired orders is indistinguishable from a sweep that never reached it.

### O2. The data-subject path

`exportBuyerOrders` and `eraseBuyerContact` exist and have no caller. Egypt PDPL 151/2020
gives a buyer both rights, and a right with no operator path is a right on paper.

- [x] An operator command for each, refusing to run without an actor identity, because
      both write an audit row naming who did it.
- [x] Both exercised end to end against a real database on 2026-09-12: an order placed
      through the real checkout, exported with name, phone and address, erasure refused
      without an actor, erased with one, and the same export afterwards returning nothing.
      The audit log carries the erasure against the operator who ran it.
- [x] Buyer PII never reaches a log line on either path. The export is written to a file
      the operator names and stdout carries a path and a count: a phone number echoed into
      a terminal is a phone number in a shell history (spec 16.5).

### O3. The runbook and the restore drill

- [x] An incident runbook: [`../../operations/runbook.md`](../../operations/runbook.md).
      Every command in it has been run.
- [x] A documented backup and restore procedure, and a drill run on 2026-09-12 with its
      result in the runbook: row counts matched, row-level security came back enabled and
      forced, and the migration ledger was intact. It also made one thing concrete, which
      is that a dump taken before an erasure restores the erased details with everything
      else, so a restore across one has to repeat it.

### O4. Named, and not engineering

These are on the critical path and are not tasks this plan can close. They are listed so
they are visible rather than discovered late.

- [ ] Privacy notice in Arabic, naming the hosting jurisdiction plainly (ADR-0013).
- [ ] The processor and controller split written into the store contract (spec 12.7).
- [ ] Egypt PDPL 151/2020 registration and a lawful-basis review.
- [ ] Per-tenant bandwidth alarm and edge rate limiting, at the CDN. Deferred until a CDN
      is chosen, which is a deployment decision and not a code one.
- [ ] Staging: one seeded fake tenant, plus one pilot's data with buyer PII redacted.

---

## Exit gates

**Stage G.** Every gate in the roadmap's table that is not assigned to E2 runs in CI and
blocks merge, with no allowlist of known failures.

**Stage O.** A restore drill completed and recorded; an export and an erasure exercised
end to end; retention running on a schedule; the runbook written. The four items in O4 are
tracked elsewhere and are not this plan's to close.
