# 0004. meshopt over Draco for geometry compression

**Status:** Accepted
**Date:** 2026-09-04

## Context

The original spec named "Draco or meshopt" as though they were interchangeable. For this
device class they are not.

The target buyer is on a mid-range Android phone, often inside the Instagram in-app browser.
Time-to-first-dressed has a 4-second budget at the 75th percentile, and decode time lands
directly inside it.

## Decision

meshoptimizer for geometry compression. KTX2 with Basis for textures (UASTC on tier A,
ETC1S on tiers B and C).

## Consequences

Draco compresses somewhat better, so files are marginally larger. Accepted.

Draco's decoder is several times slower, single-threaded, on exactly the low-end CPUs this
product targets. That cost is paid on every first view of every garment, by the user least
able to absorb it. meshopt decodes fast enough to be invisible.

meshopt also composes cleanly with LOD generation and with morph-target compression
([ADR-0003](0003-morph-targets-for-body-sizes.md)), which Draco does not do as neatly. Since
morph targets are the delivery format, this is not a minor convenience.

Textures follow the same reasoning by a different route: PNG and JPEG must be decoded and
then uploaded uncompressed, which is both a main-thread stall and a multiple of the GPU
memory ceiling. A GPU-native format avoids both. Never ship a PNG as a GPU texture.

Revisit if the reference device class changes materially, or if Draco ships a
meaningfully faster decoder.
