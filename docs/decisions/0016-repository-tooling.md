# 0016. pnpm workspaces, Vitest, ESLint flat config, dependency-cruiser

**Status:** Accepted
**Date:** 2026-09-06

## Context

Spec section 16 says the engineering standards have to be mechanical, because anything
enforced by intention gets traded away in week six. Mechanical means specific tools, and
none had been chosen. [ADR-0011](0011-frontend-stack.md) settled the frontend stack but
said nothing about how the repository itself is assembled, tested, or gated.

Four choices had to be made before any code could be written: how packages are wired
together, what runs tests, what lints, and what enforces the module boundaries of spec 16.2.

## Decision

| Concern | Choice |
|---|---|
| Package manager and workspace | pnpm workspaces, `node-linker=isolated` |
| Test runner | Vitest |
| Lint | ESLint 9 flat config with typescript-eslint, type-aware rules on |
| Format | Prettier, with `eslint-config-prettier` so the two never argue |
| Module boundaries | dependency-cruiser, run as `pnpm boundaries` |
| Contract codegen | `json-schema-to-typescript` for types, Ajv 2020 for runtime validation, both reading the same schema file |
| Script runner | The root `package.json` scripts. No task-graph tool yet |

No Turborepo, no Nx. At this size the caching they buy is smaller than the configuration
they cost, and both are addable later without moving a file.

## Consequences

**What this buys.** pnpm's isolated linker means a package that forgets a dependency fails
locally rather than in a worker image where the hoisted copy is missing. Vitest shares
esbuild with the frontend toolchain, so there is one transform pipeline rather than two.
dependency-cruiser expresses the boundary rules of spec 16.2 as data in one file, which is
the difference between a rule that is reviewed and a rule that is argued about.
`json-schema-to-typescript` plus Ajv over the same file means the types and the runtime
check cannot drift, which is enforcement point 1 of spec section 7.

**What this costs.** Type-aware ESLint is several times slower than a syntax-only lint, and
that cost lands on every commit. Accepted: the rules it enables, floating promises and
unsafe `any` flow, are the ones that catch real defects. dependency-cruiser is a second
graph analysis on top of the compiler's, so a boundary error appears at `pnpm boundaries`
rather than at `pnpm typecheck`, and a developer who runs only the typechecker will not see
it until CI does.

**What this constrains.** Generated output is committed, and a hand-edit is caught by a
drift test rather than being impossible. That is a weaker guarantee than not committing the
output at all, and it is chosen anyway so that a fresh clone typechecks before anything is
generated.

**When to revisit.** When a full `pnpm test` stops finishing in the time somebody will
actually wait, which is the point at which a task-graph tool with caching starts paying for
its configuration.
