# 0015. Documentation authority and executable contracts

**Status:** Accepted
**Date:** 2026-09-06

## Context

Talla is still at design stage, so the documentation is the project foundation. Several
documents describe the same decisions at different levels, and the project needs a clear
answer when the product spec, schema, design tokens, and operational checklists overlap.

## Decision

Use this authority order:

1. The design spec governs product scope, behavior, and phase gates.
2. The JSON Schema governs the machine-readable `GarmentSpec` contract.
3. `docs/frontend/tokens.css` governs frontend values.
4. Accepted ADRs govern choices that may reasonably be reversed.
5. Companion docs explain implementation and operations without creating a second source of truth.

Every implementation change updates the companion documentation it affects in the same
change. A contradiction is resolved before implementation by updating the relevant source
or superseding the relevant ADR.

## Consequences

The repository now has one explicit baseline for planning and implementation. The token
file and schema can be validated mechanically, while narrative docs remain readable for
people. This adds a small documentation review cost and prevents larger drift between the
spec, generated code, and the shipped interface.
