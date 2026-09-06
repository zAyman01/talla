# 0014. The margin nudge is a tiebreak only, capped at one rank

**Status:** Accepted
**Date:** 2026-09-06

## Context

The styling ranker in spec section 10 ends with a margin nudge: a small tiebreak toward
higher-margin or overstocked items. The spec is explicit that the nudge needs a hard cap
recorded here, and equally explicit about why. Left uncapped, it will be raised under
revenue pressure until the suggestion strip is visibly self-serving, and by then nobody
will remember what the original value was or that there was ever supposed to be a limit.

The pressure is real and will not feel unreasonable when it arrives. A pilot store asks why
its overstocked jackets never appear. A prospect asks whether the tool can push a
particular line. Each request is small. The cap exists so that the answer is a documented
number rather than a judgement call made under pressure by whoever owns the file that week.

There is also a product argument, and it is the stronger one. The suggestion strip's value
is that a buyer believes it. The one-line reason attached to every suggestion in spec
section 10 exists to make the output read as styling rather than randomness. A nudge large
enough to visibly reorder outfits makes that reason a lie, and a buyer who catches it once
stops trusting the strip permanently.

## Decision

The margin nudge applies **only as a tiebreak between items whose soft scores are within
2% of each other**, and may move an item **at most one position** in the final ranking.

It is bounded further by the rules it can never cross:

- It never promotes an item above a store pin. Pins outrank everything.
- It never introduces an item that failed the stock filter or a hard rule. The nudge
  reorders the surviving set; it does not add to it.
- It never changes the one-line reason. If the reason would not have been written without
  the nudge, the nudge went too far.

The cap is a constant in the ranker, named for what it is, and the ranker's property tests
assert the two invariants directly: no output ordering differs from the un-nudged ordering
by more than one position, and no pinned pair is ever outranked.

Raising either number requires superseding this record. It is not a configuration value, it
is not per-tenant, and it is not an environment variable.

## Consequences

**What this costs.** Very little commercial leverage. At one rank of movement inside a 2%
score band, the nudge will change the visible top six rarely, and a store owner asking to
push a line will not get much from it. That is the intended outcome, and it means the honest
answer to that request is store pins, which the owner controls directly and which rank above
everything.

**What it buys.** The suggestion strip stays defensible in a room. When a prospect asks
whether Talla pushes stock it wants to move, the answer is a number and a test rather than
a reassurance. The instrumentation in spec section 17 also stays clean: a nudge large enough
to shift ordering would confound the holdout comparison it is meant to measure.

**The failure mode this accepts.** Overstock genuinely does sit unsold, and this cap means
the ranker is close to useless as a merchandising lever. Accepted. Merchandising levers
belong to the store owner through pins, where they are visible and attributable, not buried
in a scoring function where nobody can see them.

**Revisit** only with evidence that the cap costs a store real revenue without buyers
noticing the difference. Revenue pressure alone is not evidence, and it is the exact
pressure this record exists to answer.
