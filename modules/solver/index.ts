import type { Block, FabricPreset } from '@talla/blocks';
import type { GarmentSpec } from '@talla/garment-spec';
import type { BodySize, Result, Sha256 } from '@talla/shared';

/**
 * Drape simulation. Runs at upload time only: a buyer click never solves anything.
 *
 * Guarantee to callers: deterministic for a given spec, block, and body triple. Two
 * runs of the same input produce the same mesh, which is what makes a re-solve
 * diagnosable and content addressing meaningful.
 */

export interface SolveInput {
  readonly spec: GarmentSpec;
  readonly block: Block;
  readonly fabric: FabricPreset;
  readonly baseBody: BodySize;
  /** The other body sizes, solved in the same pass and shipped as morph deltas. */
  readonly morphBodies: readonly BodySize[];
}

export interface SolvedGarment {
  readonly baseMeshSha256: Sha256;
  /** One delta per morph body, in the order they were requested (spec 11.3). */
  readonly morphDeltaSha256: readonly Sha256[];
  /** The baked drape settle, played once when the garment lands (spec 14.2). */
  readonly settleClipSha256: Sha256;
  readonly solveSeconds: number;
}

export type SolveFailure = 'SOLVE_NON_CONVERGENT' | 'SOLVE_SELF_INTERSECTION';

export interface Solver {
  solve(input: SolveInput): Promise<Result<SolvedGarment, SolveFailure>>;
}
