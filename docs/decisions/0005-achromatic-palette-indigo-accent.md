# 0005. Achromatic interface, single indigo accent

**Status:** Accepted
**Date:** 2026-09-04
**Supersedes:** the "warm stone and sand neutrals" direction in the original spec

## Context

The original identity direction was warm stone and sand neutrals with a single accent,
justified by the requirement that garment colors must read true.

Two problems with that direction, and the first is the serious one.

**Warm neutrals bias the merchandise.** Perceived color is judged against its surround. A
sand-toned stage pushes a garment's apparent hue cooler and mutes warm reds, which is
exactly the error that gets a cash-on-delivery parcel refused at the door when the buyer
sees the real thing. The direction worked against the constraint it was written to serve.
Retouchers judge color against neutral gray for this reason.

**It is also the current generic default.** Warm cream ground plus a terracotta accent is
what design tooling produces for any brief described as premium and considered. Worse here
specifically: rust and clay are common garment colors, so the accent would have collided
with the catalog as well as with everyone else's homepage.

## Decision

An achromatic interface. The viewer stage is neutral gray and stays neutral in both light
and dark themes. One accent, indigo `#26356b`, appearing only on the primary CTA, the active
navigation indicator, and the focus ring. Nothing chromatic within 200px of a garment.

Boldness is spent on typography instead ([ADR-0006](0006-arabic-first-typography.md)).

## Consequences

The interface is less immediately warm than the original direction. Accepted: the
merchandise supplies the warmth, and there is a store's entire catalog of it.

Indigo is chosen for two reasons. Indigo dyeing has a long history across North Africa and
the Levant, so it reads as considered rather than arbitrary. And a deep desaturated blue is
the color least likely to compete with a store's actual stock, unlike a rust or clay accent
which is itself a garment color.

The stage stays mid-value rather than near-black in dark mode. This makes dark mode less
internally consistent, and that is the correct trade: a near-black stage makes light
garments glare and dark garments disappear. An accurate stage matters more than a consistent
one.

Constraining the accent to three uses means the interface has very few places to express
brand. That is the point, and it is why the typography decision carries more weight than it
normally would.
