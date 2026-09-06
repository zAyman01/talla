# 0011. Next.js, Tailwind v4, Three.js, Motion for the frontend stack

**Status:** Accepted
**Date:** 2026-09-06

## Context

Spec section 24 listed the web framework among the technology choices still open, to be
made during implementation planning. Meanwhile
[`docs/frontend/README.md`](../frontend/README.md) section 3 already states the stack as
settled and the rest of the frontend documentation is written against it: the token
pipeline assumes CSS custom properties consumed as Tailwind theme values, the motion
document assumes Motion values rather than React state for continuous values, and the
viewer rules assume a Three.js render loop inside a client leaf.

So the decision was already made and used, but never recorded. That is exactly the failure
this directory exists to prevent, and it was one conversation away from becoming two
different remembered versions of the same agreement.

This record does not make a new choice. It writes down the one the frontend documentation
already depends on, and gives the reasoning that was never captured.

## Decision

| Concern | Choice |
|---|---|
| Framework | Next.js, App Router, Server Components by default |
| Styling | Tailwind v4, tokens as CSS custom properties |
| UI motion | Motion, imported from `motion/react` |
| 3D | Three.js, viewer only |
| Icons | Phosphor, `@phosphor-icons/react`, `weight="regular"` globally |
| Fonts | `next/font`, self-hosted |
| State | `useState` locally, Zustand for cart and viewer session |

One hard architectural rule follows from the combination: Three.js and Motion never share
a component tree, because they compete for the same frames. The viewer is a client leaf
that owns its canvas and its own loop.

Spec section 24 is updated to remove the web framework from the open list. The remaining
technology choices there, the segmentation model and the cloth solver, stay open and are
Person A's to make from what Phase 0 proves.

## Consequences

**What this buys.** Server Components keep the buyer's critical path small on a phone
where every kilobyte of JavaScript is parsed on a weak core, which is the budget in spec
11.1 that everything else is measured against. Tailwind v4 reads tokens directly from
`tokens.css`, so there is one source of truth for a color and no build step translating
between two of them. `next/font` self-hosts, which removes a third-party request from the
critical path and one processor relationship from section 12.7.

**What this costs.** Next.js is a large dependency with an opinionated upgrade cadence,
and a major version bump is not a quiet afternoon for a team of two. Tailwind v4 is newer
than v3 and its ecosystem is thinner. Both are accepted: the alternative is assembling the
same capabilities from smaller parts and maintaining the glue, which is worse at this team
size.

**What this constrains.** Server Components by default means client components are leaves
rather than layouts, and a component that reaches for a browser API high in the tree is a
design error rather than a `'use client'` away from working. The rule about Three.js and
Motion means the viewer cannot use the page's animation primitives, and page chrome cannot
animate over the canvas. Both constraints are load-bearing for the frame budget, not
stylistic.

**When to revisit.** The Shopify widget extraction in Phase 3 embeds the viewer in someone
else's page, where Next.js is not present. The viewer is already isolated behind a client
leaf with its own loop, which is what makes that extraction possible, but the widget's
build will not be this stack and should get its own record.
