import type { FabricPreset } from '@talla/blocks';
import { bodyStations, garmentMesh, morphDelta } from '@talla/blocks';
import type { BodySize, Result, Sha256 } from '@talla/shared';
import type { SolvedGarment, SolveFailure, SolveInput, Solver } from '../contract.ts';

/**
 * Universal SHA-256 hash helper that operates in both Node.js and browser environments.
 */
async function hashBytes(bytes: Uint8Array): Promise<Sha256> {
  if (typeof globalThis.crypto.subtle !== 'undefined') {
    const hashBuffer = await globalThis.crypto.subtle.digest(
      'SHA-256',
      bytes,
    );
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  }
  const { createHash } = await import('node:crypto');
  return createHash('sha256').update(bytes).digest('hex');
}

interface Edge {
  readonly i: number;
  readonly j: number;
  readonly restLength: number;
}

/**
 * Extracts unique manifold edges from triangle index buffer.
 */
function extractEdges(positions: Float32Array, indices: Uint32Array): readonly Edge[] {
  const edgeMap = new Map<string, Edge>();
  for (let k = 0; k < indices.length; k += 3) {
    const a = indices[k] ?? 0;
    const b = indices[k + 1] ?? 0;
    const c = indices[k + 2] ?? 0;
    const tri = [
      [Math.min(a, b), Math.max(a, b)],
      [Math.min(b, c), Math.max(b, c)],
      [Math.min(c, a), Math.max(c, a)],
    ] as const;

    for (const [i, j] of tri) {
      const key = `${String(i)}:${String(j)}`;
      if (!edgeMap.has(key)) {
        const dx = (positions[i * 3] ?? 0) - (positions[j * 3] ?? 0);
        const dy = (positions[i * 3 + 1] ?? 0) - (positions[j * 3 + 1] ?? 0);
        const dz = (positions[i * 3 + 2] ?? 0) - (positions[j * 3 + 2] ?? 0);
        const restLength = Math.hypot(dx, dy, dz);
        edgeMap.set(key, { i, j, restLength });
      }
    }
  }
  return Array.from(edgeMap.values());
}

/**
 * XPBD Cloth Simulation Step.
 * Implements Extended Position-Based Dynamics with distance constraints,
 * body collision SDF pushout, and settle keyframing.
 */
function simulateCloth(
  positions: Float32Array,
  indices: Uint32Array,
  fabric: FabricPreset,
  bodySize: BodySize,
  substeps = 15,
): { readonly restPositions: Float32Array; readonly settleFrames: readonly Float32Array[] } {
  const numVertices = positions.length / 3;
  const current = Float32Array.from(positions);
  const prev = Float32Array.from(positions);
  const edges = extractEdges(current, indices);

  const stations = bodyStations(bodySize);
  const allRings = [...stations.torso, ...stations.leg, ...stations.arm];
  const minClearanceM = 0.004; // 4 mm clearance gate per spec 8.2

  const settleFrames: Float32Array[] = [];
  const dt = 0.016; // 60 fps timestep
  const gravity = -9.81 * 0.15; // Scaled gravity for natural fabric drape settle
  const compliance = (1 - Math.min(fabric.stretchStiffness, 0.99)) * 0.0005;

  for (let step = 0; step < substeps; step += 1) {
    // 1. Predict positions with gravity
    for (let i = 0; i < numVertices; i += 1) {
      const idx = i * 3;
      prev[idx] = current[idx] ?? 0;
      prev[idx + 1] = current[idx + 1] ?? 0;
      prev[idx + 2] = current[idx + 2] ?? 0;

      // Top shoulder/collar anchors have higher inertia
      const isTopAnchor = (current[idx + 1] ?? 0) > 1.4;
      if (!isTopAnchor) {
        current[idx + 1] = (current[idx + 1] ?? 0) + gravity * dt * dt;
      }
    }

    // 2. Solve distance constraints (XPBD)
    for (const edge of edges) {
      const i3 = edge.i * 3;
      const j3 = edge.j * 3;
      const dx = (current[i3] ?? 0) - (current[j3] ?? 0);
      const dy = (current[i3 + 1] ?? 0) - (current[j3 + 1] ?? 0);
      const dz = (current[i3 + 2] ?? 0) - (current[j3 + 2] ?? 0);
      const len = Math.hypot(dx, dy, dz);
      if (len < 1e-6) continue;

      const diff = len - edge.restLength;
      const alpha = compliance / (dt * dt);
      const lambda = -diff / (2 + alpha);
      const corrX = (dx / len) * lambda * 0.5;
      const corrY = (dy / len) * lambda * 0.5;
      const corrZ = (dz / len) * lambda * 0.5;

      current[i3] = (current[i3] ?? 0) + corrX;
      current[i3 + 1] = (current[i3 + 1] ?? 0) + corrY;
      current[i3 + 2] = (current[i3 + 2] ?? 0) + corrZ;

      current[j3] = (current[j3] ?? 0) - corrX;
      current[j3 + 1] = (current[j3 + 1] ?? 0) - corrY;
      current[j3 + 2] = (current[j3 + 2] ?? 0) - corrZ;
    }

    // 3. Body collision SDF projection (ensures >= 4mm clearance outside mannequin)
    for (let i = 0; i < numVertices; i += 1) {
      const idx = i * 3;
      const vy = current[idx + 1] ?? 0;
      // Find nearest station ring by vertical height
      let nearestDist = Infinity;
      let bodyRadius = 0.12;
      for (const ring of allRings) {
        const dy = Math.abs(ring.y - vy);
        if (dy < nearestDist) {
          nearestDist = dy;
          bodyRadius = (ring.girthCm / (2 * Math.PI * 100)) + minClearanceM;
        }
      }

      const vx = current[idx] ?? 0;
      const vz = current[idx + 2] ?? 0;
      const radialDist = Math.hypot(vx, vz);
      if (radialDist < bodyRadius && radialDist > 1e-6) {
        const factor = bodyRadius / radialDist;
        current[idx] = vx * factor;
        current[idx + 2] = vz * factor;
      }
    }

    // Record the final 12 iterations as the baked settle animation
    if (step >= substeps - 12) {
      settleFrames.push(Float32Array.from(current));
    }
  }

  return { restPositions: current, settleFrames };
}

/**
 * Checks whether solved positions are physically plausible and non-divergent.
 */
function isSolveValid(positions: Float32Array): boolean {
  for (let i = 0; i < positions.length; i += 1) {
    const val = positions[i] ?? 0;
    if (!Number.isFinite(val) || Math.abs(val) > 10.0) {
      return false;
    }
  }
  return true;
}

/**
 * Extended Position-Based Dynamics (XPBD) Cloth Solver implementation.
 * Guarantees determinism, strict collision clearance, and baked 12-frame drape settle.
 */
export class XpbdSolver implements Solver {
  async solve(input: SolveInput): Promise<Result<SolvedGarment, SolveFailure>> {
    const startTime = performance.now();

    // 1. Base mesh geometry
    const blockId = input.block.id as Parameters<typeof garmentMesh>[0];
    const baseMesh = garmentMesh(blockId, input.baseBody, 'base');
    const { restPositions: basePositions, settleFrames } = simulateCloth(
      baseMesh.positions,
      baseMesh.indices,
      input.fabric,
      input.baseBody,
    );

    if (!isSolveValid(basePositions)) {
      return { ok: false, error: 'SOLVE_NON_CONVERGENT' };
    }

    // 2. Hash base mesh
    const baseMeshSha256 = await hashBytes(new Uint8Array(basePositions.buffer));

    // 3. Solve across morph bodies and compute deltas
    const morphDeltaSha256: Sha256[] = [];
    for (const morphBody of input.morphBodies) {
      const morphTargetMesh = garmentMesh(blockId, morphBody, 'base');
      const { restPositions: solvedMorph } = simulateCloth(
        morphTargetMesh.positions,
        morphTargetMesh.indices,
        input.fabric,
        morphBody,
      );

      if (!isSolveValid(solvedMorph)) {
        return { ok: false, error: 'SOLVE_NON_CONVERGENT' };
      }

      const delta = morphDelta(
        { ...baseMesh, positions: basePositions },
        { ...morphTargetMesh, positions: solvedMorph },
      );
      const deltaHash = await hashBytes(new Uint8Array(delta.buffer));
      morphDeltaSha256.push(deltaHash);
    }

    // 4. Pack and hash the 12-frame drape settle clip
    const totalSettleBytes = settleFrames.length * basePositions.byteLength;
    const settleBuffer = new Uint8Array(totalSettleBytes);
    for (let f = 0; f < settleFrames.length; f += 1) {
      const frame = settleFrames[f];
      if (frame) {
        settleBuffer.set(new Uint8Array(frame.buffer), f * basePositions.byteLength);
      }
    }
    const settleClipSha256 = await hashBytes(settleBuffer);

    const solveSeconds = (performance.now() - startTime) / 1000;

    return {
      ok: true,
      value: {
        baseMeshSha256,
        morphDeltaSha256,
        settleClipSha256,
        solveSeconds,
      },
    };
  }
}

export function createSolver(): Solver {
  return new XpbdSolver();
}
