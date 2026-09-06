# 0012. The reference device is a Samsung Galaxy A16, 4 GB

**Status:** Accepted
**Date:** 2026-09-06

## Context

Every performance budget in spec 11.1 is written as a number without a device, and a
number without a device is not a budget. "Under 2.5 seconds" is trivially true on a
developer's laptop and may be impossible on the phone a buyer actually holds. The spec
called for one named, cheap, real Android phone bought in week one, in the roughly $120
bracket with 4 GB of RAM and a low-tier Mali or Adreno GPU, and left the model to be named
in this log.

The device also decides three other things that are awkward to change later: the tier B
rung of the ladder in spec 11.2, the throttled profile the Lighthouse CI gate runs
against, and the pre-flight check in
[`docs/frontend/README.md`](../frontend/README.md) section 8.

The choice is between a device that flatters the viewer and one that condemns it. A
stronger phone lets work pass that the median buyer will experience as broken. A weaker
phone forces constraints the market does not actually impose, and a viewer tuned for the
bottom of the market looks poorer than it needs to for everyone else.

## Decision

**Samsung Galaxy A16, 4 GB RAM variant.** One physical unit, bought in week one, kept on a
desk rather than in a drawer, and used for every measurement in spec 11.1.

It is the tier B reference: the common case that the device ladder is built around, not
the ceiling and not the floor. Tier A and tier C are still verified, but on borrowed
hardware and less often.

The Phase 0 device gate runs on this phone, in the Instagram in-app WebView, against the
TTFD budget. The Lighthouse gate in CI throttles to a profile derived from it. The release
test matrix in spec 11.1 keeps its other three entries unchanged.

## Consequences

**Why this one.** It is among the best-selling Android phones in the primary market, which
means the reference device is a phone that real buyers own rather than a synthetic proxy
for one. Its 4 GB of RAM and mid-tier Mali GPU put it at the boundary the spec cares about:
comfortably tier B, close enough to tier C that GPU memory pressure shows up here first,
and weak enough that a lazy asset budget fails visibly rather than subtly.

**What it costs.** A single named device is a single point of measurement, and a viewer
tuned to one GPU driver can carry a driver-specific assumption for months without anyone
noticing. The test matrix is the mitigation and it is thinner than it would be at a larger
company. Accepted: with two people, a broad device lab is a lab nobody runs.

**What it prevents.** Arguments. A budget miss is now a fact rather than an opinion about
whose machine was used, and "it is fast on mine" stops being a defensible sentence in
review.

**The unpleasant consequence.** Phones age out. The A16 will stop being a representative
mid-market device in roughly two years, at which point every budget in spec 11.1 quietly
becomes more generous than intended. The budgets do not move on their own, so the
replacement is a superseding record here, not a silent swap of the phone on the desk.

**Revisit** when the A16 stops appearing in the market's top sellers, or if the pilot
stores' analytics show their real traffic sitting materially below it. Either case is a new
record, not an edit to this one.
