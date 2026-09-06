/**
 * The contract, as types only.
 *
 * Runtime validation lives behind '@talla/garment-spec/validate' because it reads the
 * schema from disk with Ajv, and the viewer runs in a browser where there is no disk.
 * A type-only entry point keeps the contract importable from both sides.
 */
export type { GarmentSpec } from './generated/garment-spec.ts';
