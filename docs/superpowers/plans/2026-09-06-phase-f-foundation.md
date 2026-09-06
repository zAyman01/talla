# Phase F — Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps
> use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up a repository that builds, typechecks, generates its contracts, and fails
CI on a module-boundary violation, so that every later phase writes product code against
mechanical standards rather than intentions.

**Architecture:** One pnpm workspace laid out exactly as
[`docs/architecture/overview.md`](../../architecture/overview.md) specifies: `apps/`,
`modules/`, `workers/`, `packages/`. Each `modules/*` publishes a single interface file and
keeps everything else internal. Contracts are generated, never hand-written:
`packages/garment-spec` from the JSON Schema, `packages/tokens` from `tokens.css`. Boundary
rules are data in `.dependency-cruiser.cjs`, enforced by CI.

**Tech Stack:** TypeScript 5 strict, pnpm workspaces, Vitest, ESLint 9 flat config with
typescript-eslint, Prettier, dependency-cruiser, json-schema-to-typescript, Ajv, GitHub
Actions, gitleaks.

**Spec:** [`../specs/2026-09-04-talla-design.md`](../specs/2026-09-04-talla-design.md),
sections 5, 7, 16. Phase context in
[`2026-09-06-build-phases.md`](2026-09-06-build-phases.md).

## Global constraints

- One language across storefront, admin, and API: TypeScript. Workers may differ only where
  the library ecosystem demands it (spec 16.1).
- `strict: true`. `any` requires a comment naming the reason (spec 16.1, CLAUDE.md 5).
- `GarmentSpec` types are generated from
  [`garment-spec.schema.json`](../../architecture/garment-spec.schema.json) and never
  hand-edited (spec 7, CLAUDE.md 3).
- A module is imported through its published interface only. Shared code lives in `shared`.
  There is no `utils` module (spec 16.2).
- No raw color, size, duration, radius, or easing value outside
  [`tokens.css`](../../frontend/tokens.css) (CLAUDE.md 1).
- Arabic string first, then English. Zero em-dashes in anything a user sees (CLAUDE.md 6).
- Conventional commits, scopes from spec section 5 plus `docs` and `infra`
  ([`CONTRIBUTING.md`](../../../CONTRIBUTING.md)).
- Every CI gate blocks merge. A gate that warns is a gate that is ignored (spec 16.4).
- Node 24, pnpm 11, pinned in the root `package.json` `engines` field.

---

## File structure

| Path | Responsibility |
|---|---|
| `package.json`, `pnpm-workspace.yaml` | Workspace root. Its scripts are the only entry points CI calls |
| `tsconfig.base.json` | Strict compiler settings every package extends |
| `eslint.config.js` | Flat config: typescript-eslint, Prettier interop |
| `.dependency-cruiser.cjs` | Module boundary rules. The linter of spec 16.2 |
| `vitest.config.ts` | Test runner config for the workspace |
| `packages/garment-spec/` | Generated `GarmentSpec` types, generator, fixtures, contract test |
| `packages/tokens/` | Generator from `tokens.css` to TypeScript, plus the drift test |
| `packages/errors/` | The error taxonomy in code: codes, Arabic and English copy, fix actions |
| `modules/*/index.ts` | Each module's published interface. The only importable path |
| `modules/*/internal/` | Module internals. Importable only from inside that module |
| `workers/image/`, `workers/gpu/` | Worker entry points. Placeholders here, real in Phase 1 |
| `.github/workflows/ci.yml` | Every gate that can exist without application code |
| `docs/decisions/0016-*.md` | Record of the tooling choices this plan makes |

Apps (`apps/storefront`, `apps/admin`, `apps/marketing`) are created in Phase 1 with the
Next.js work. Creating empty Next.js apps now pins a framework version months before the
first page is written, and the upgrade is not a quiet afternoon (ADR-0011).

---

### Task 1: Workspace skeleton and strict TypeScript

**Files:**
- Create: `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `tsconfig.json`,
  `.npmrc`, `.prettierrc.json`, `eslint.config.js`, `vitest.config.ts`,
  `test/workspace.test.ts`
- Create: `docs/decisions/0016-repository-tooling.md`
- Modify: `docs/decisions/README.md`

**Interfaces:**
- Consumes: nothing.
- Produces: workspace scripts `generate`, `typecheck`, `lint`, `format:check`, `test`,
  `boundaries`. Every later task hangs its check off one of these.

- [ ] **Step 1: Write the failing test** at `test/workspace.test.ts`: read the root
  `package.json`, assert the six scripts exist, assert `engines.node` starts with `>=24`,
  assert `packageManager` names pnpm.
- [ ] **Step 2: Run it.** `pnpm vitest run` fails: no workspace.
- [ ] **Step 3: Create the workspace.** Root `package.json` with those scripts,
  `pnpm-workspace.yaml` listing `packages/*`, `modules/*`, `workers/*`, `apps/*`, and
  `tsconfig.base.json` with `strict`, `noUncheckedIndexedAccess`,
  `exactOptionalPropertyTypes`, `verbatimModuleSyntax`, `moduleResolution: bundler`.
- [ ] **Step 4: Run `pnpm install` then `pnpm test`.** Passes.
- [ ] **Step 5: Write ADR-0016** recording pnpm workspaces, Vitest, ESLint flat config,
  dependency-cruiser, json-schema-to-typescript and Ajv, with the trade-off each accepts.
- [ ] **Step 6: Commit.** `chore(infra): scaffold pnpm workspace with strict TypeScript`.

### Task 2: `packages/garment-spec`, the generated contract

**Files:**
- Create: `packages/garment-spec/package.json`, `scripts/generate.ts`, `src/index.ts`,
  `src/generated/garment-spec.ts` (generated), `fixtures/*.json`, `test/contract.test.ts`

**Interfaces:**
- Consumes: `docs/architecture/garment-spec.schema.json`.
- Produces: `export type { GarmentSpec }`, and
  `export function validateGarmentSpec(value: unknown): ValidationResult` where
  `ValidationResult` is `{ ok: true; value: GarmentSpec } | { ok: false; errors: string[] }`.

- [ ] **Step 1: Write the failing contract test.** A valid fixture validates. Fixtures
  missing a required field, carrying an unknown field, and using a malformed `spec_version`
  each fail with a named error path.
- [ ] **Step 2: Run it.** Fails: no module.
- [ ] **Step 3: Write the generator.** `json-schema-to-typescript` over the schema into
  `src/generated/`, with a "generated file, do not edit" banner.
- [ ] **Step 4: Write the validator.** Ajv 2020 compiled from the same schema file, so the
  types and the runtime check cannot drift apart.
- [ ] **Step 5: Run tests.** Pass.
- [ ] **Step 6: Add the drift test.** Regenerate to a temporary path and assert byte
  equality with the committed output, so a hand-edit fails CI (spec 7, enforcement 1).
- [ ] **Step 7: Commit.** `feat(shared): generate GarmentSpec types and validator from the schema`.

### Task 3: `packages/tokens`, generated design tokens

**Files:**
- Create: `packages/tokens/package.json`, `scripts/generate.ts`, `src/generated/tokens.ts`,
  `src/index.ts`, `test/tokens.test.ts`

**Interfaces:**
- Consumes: `docs/frontend/tokens.css`.
- Produces: `export const tokens: Readonly<Record<TokenName, string>>`,
  `export type TokenName`, and `export function token(name: TokenName): string` returning
  the `var(--name)` reference rather than the literal value.

- [ ] **Step 1: Write the failing test.** `tokens['--accent']` equals `#26356b`;
  `token('--accent')` returns `var(--accent)`; the dark-theme override is captured
  separately from the light value rather than overwriting it.
- [ ] **Step 2: Run it.** Fails.
- [ ] **Step 3: Write the generator.** Parse the `:root` block and the dark block from
  `tokens.css`, emit a frozen object plus the union type.
- [ ] **Step 4: Run tests.** Pass.
- [ ] **Step 5: Add the drift test,** same shape as Task 2.
- [ ] **Step 6: Commit.** `feat(shared): generate design tokens from tokens.css`.

### Task 4: `packages/errors`, the error taxonomy in code

**Files:**
- Create: `packages/errors/package.json`, `src/catalog.ts`, `src/index.ts`,
  `test/catalog.test.ts`

**Interfaces:**
- Consumes: `docs/architecture/error-taxonomy.md`.
- Produces: `export type ErrorCode`,
  `export const errorCatalog: Readonly<Record<ErrorCode, ErrorEntry>>`, and
  `export function toWireError(code: ErrorCode, traceId: string): WireError`, shaped
  exactly as the taxonomy's JSON block.

- [ ] **Step 1: Write the failing tests.** Every user-facing code carries a non-empty
  Arabic and English message and a fix action in both languages. No user-facing string
  contains an em-dash. Codes are unique. `toWireError` emits only the documented fields and
  never a message for an internal-only code.
- [ ] **Step 2: Run them.** Fail.
- [ ] **Step 3: Write the catalog,** every code from the taxonomy, Arabic written first in
  each entry.
- [ ] **Step 4: Run tests.** Pass.
- [ ] **Step 5: Commit.** `feat(shared): add the error taxonomy as typed codes and copy`.

### Task 5: Module and worker skeletons with published interfaces

**Files:**
- Create: `modules/{ingest,understanding,blocks,solver,assets,viewer,styling,commerce,tenancy,shared}/`
  each with `package.json`, `index.ts`, `internal/.gitkeep`
- Create: `workers/image/`, `workers/gpu/` entry points
- Create: `test/modules.test.ts`

**Interfaces:**
- Consumes: `packages/garment-spec`, `packages/errors`.
- Produces: one published interface per module, matching the module contract table in
  [`architecture/overview.md`](../../architecture/overview.md). Types only in Phase F, no
  behavior.

- [ ] **Step 1: Write the failing test.** For each of the ten modules, `index.ts` exists and
  is non-empty, and the module `package.json` `exports` map exposes `.` only.
- [ ] **Step 2: Run it.** Fails.
- [ ] **Step 3: Create the modules.** Each `index.ts` declares the published types drawn
  from the contract table, carrying that module's guarantee sentence as its doc comment.
- [ ] **Step 4: Run typecheck and tests.** Pass.
- [ ] **Step 5: Commit.** `feat(shared): publish the ten module interfaces`.

### Task 6: The module boundary linter

**Files:**
- Create: `.dependency-cruiser.cjs`, `test/boundaries.test.ts`,
  `test/fixtures/boundary-violation/`

**Interfaces:**
- Consumes: the module layout from Task 5.
- Produces: `pnpm boundaries`, a merge-blocking gate.

- [ ] **Step 1: Write the failing test.** Running the cruiser over a planted fixture that
  imports `modules/commerce/internal/*` from `modules/styling` exits non-zero and names the
  violated rule.
- [ ] **Step 2: Run it.** Fails: no config.
- [ ] **Step 3: Write the rules.** Forbid cross-module internal imports; forbid a module
  importing an app; forbid any path segment named `utils`; forbid importing
  `packages/garment-spec/src/generated` from outside that package; keep `shared` a leaf that
  imports no module.
- [ ] **Step 4: Run `pnpm boundaries`.** Clean on the real tree, non-zero on the fixture.
- [ ] **Step 5: Commit.** `ci(infra): enforce module boundaries with dependency-cruiser`.

### Task 7: CI workflow and documentation update

**Files:**
- Create: `.github/workflows/ci.yml`
- Modify: `CONTRIBUTING.md`, `docs/README.md`, `docs/architecture/overview.md`

**Interfaces:**
- Consumes: every script from Tasks 1 to 6.
- Produces: a merge-blocking workflow on pull requests to `master`.

- [ ] **Step 1: Write the workflow.** Install, generation drift check, typecheck, lint,
  format check, boundaries, tests, gitleaks secret scan, `pnpm audit --audit-level high`.
- [ ] **Step 2: Run each job's command locally.** All pass.
- [ ] **Step 3: Update the docs.** The gates table in `CONTRIBUTING.md` marks which gates
  are live now and which land with the code they measure, so the table stops describing
  gates that do not exist. `docs/README.md` and `architecture/overview.md` gain the
  generated packages.
- [ ] **Step 4: Commit.** `ci(infra): add the merge-blocking gate workflow`.

---

## Self-review

**Spec coverage.** 16.1 language and types: Task 1. 16.2 boundaries: Tasks 5 and 6. 16.4
gates: Task 7, minus the five that need application code. Section 7 contract enforcement,
points 1 and 3: Task 2. Point 2, additive-only schema change, stays a review rule in
`CONTRIBUTING.md`; it is not automatable until there is a shipped schema version to diff
against, and that is Phase 0's exit. 16.5 error codes: Task 4. CLAUDE.md rule 1, no
improvised values: Task 3.

**Known gap, stated rather than hidden.** Phase F ships no application code, so the RLS
isolation, bundle budget, asset budget, golden-image, and Lighthouse gates cannot run. They
are named in `CONTRIBUTING.md` against the phase that lands them, and they are Phase 1 exit
criteria in the phase plan.
