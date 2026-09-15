/**
 * Mesh primitives for the parametric block library.
 *
 * Everything here is pure arithmetic over typed arrays: no Three.js, no DOM, no WebGL.
 * That is deliberate. The geometry is the part worth testing, and it tests in Node in
 * milliseconds, while the renderer that consumes it stays a client leaf in the app
 * (ADR-0018).
 *
 * Units are metres for positions and centimetres for girths, because those are the units
 * the two readers of this file think in: a scene is metres, a size chart is centimetres.
 * The conversion happens once, here, rather than in every caller.
 */

/** One horizontal slice of a body or a garment. */
export interface Ring {
  /** Height above the floor, metres. */
  readonly y: number;
  /** Circumference of the finished slice, centimetres. */
  readonly girthCm: number;
  /** Front-to-back depth as a fraction of side-to-side width. 1 is circular. */
  readonly depthRatio: number;
  /** Lateral offset, metres. Legs and arms are the same loft, moved sideways. */
  readonly centerX: number;
  /** Front-to-back offset, metres. Carries the small posture curve of the torso. */
  readonly centerZ: number;
  /**
   * Superellipse exponent. 2 is an ellipse, higher is a rounded rectangle. A torso reads
   * as a torso rather than a pipe at about 2.4, and cloth sits slightly rounder than the
   * body it hangs on.
   */
  readonly exponent: number;
}

export interface MeshData {
  readonly positions: Float32Array;
  readonly normals: Float32Array;
  readonly uvs: Float32Array;
  readonly indices: Uint32Array;
}

const CM_PER_M = 100;

/**
 * Unit outline of a superellipse, half-width 1 and half-depth `depthRatio`.
 *
 * Returned as interleaved x, z pairs so the caller scales and translates in one pass.
 */
function outline(segments: number, depthRatio: number, exponent: number): Float64Array {
  const points = new Float64Array(segments * 2);
  const power = 2 / exponent;
  for (let i = 0; i < segments; i += 1) {
    const angle = (i / segments) * Math.PI * 2;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    points[i * 2] = Math.sign(cos) * Math.abs(cos) ** power;
    points[i * 2 + 1] = Math.sign(sin) * Math.abs(sin) ** power * depthRatio;
  }
  return points;
}

function perimeter(points: Float64Array): number {
  const count = points.length / 2;
  let total = 0;
  for (let i = 0; i < count; i += 1) {
    const next = (i + 1) % count;
    const dx = (points[next * 2] ?? 0) - (points[i * 2] ?? 0);
    const dz = (points[next * 2 + 1] ?? 0) - (points[i * 2 + 1] ?? 0);
    total += Math.hypot(dx, dz);
  }
  return total;
}

/**
 * The points of one ring, in metres, positioned in the scene.
 *
 * The outline is scaled so its polygon perimeter equals the requested girth exactly. That
 * is what makes a fit reading arithmetic rather than an estimate: the garment ring a buyer
 * sees is the same number the ease is computed from, not an approximation of it.
 */
export function ringPoints(ring: Ring, segments: number): Float64Array {
  const unit = outline(segments, ring.depthRatio, ring.exponent);
  const scale = ring.girthCm / CM_PER_M / perimeter(unit);
  const placed = new Float64Array(unit.length);
  for (let i = 0; i < segments; i += 1) {
    placed[i * 2] = (unit[i * 2] ?? 0) * scale + ring.centerX;
    placed[i * 2 + 1] = (unit[i * 2 + 1] ?? 0) * scale + ring.centerZ;
  }
  return placed;
}

/** Measured circumference of a built ring, centimetres. The fit tests check against it. */
export function ringGirthCm(ring: Ring, segments: number): number {
  const points = ringPoints(ring, segments);
  const centered = new Float64Array(points.length);
  for (let i = 0; i < segments; i += 1) {
    centered[i * 2] = (points[i * 2] ?? 0) - ring.centerX;
    centered[i * 2 + 1] = (points[i * 2 + 1] ?? 0) - ring.centerZ;
  }
  return perimeter(centered) * CM_PER_M;
}

/**
 * Lerp a stack of rings to an arbitrary height. Rings are ordered bottom to top.
 *
 * Shared because both the body and the blocks that hang on it need a cross section at a
 * height no station happens to sit at: a hem, a waistband, the height an arm rests
 * beside.
 */
export function ringAtHeight(rings: readonly Ring[], y: number): Ring {
  const first = rings[0];
  const last = rings[rings.length - 1];
  if (!first || !last) throw new Error('a ring stack needs at least one ring');
  if (y <= first.y) return { ...first, y };
  if (y >= last.y) return { ...last, y };
  for (let i = 1; i < rings.length; i += 1) {
    const lower = rings[i - 1];
    const upper = rings[i];
    if (!lower || !upper || y > upper.y) continue;
    const t = (y - lower.y) / (upper.y - lower.y);
    return {
      y,
      girthCm: lower.girthCm + (upper.girthCm - lower.girthCm) * t,
      depthRatio: lower.depthRatio + (upper.depthRatio - lower.depthRatio) * t,
      centerX: lower.centerX + (upper.centerX - lower.centerX) * t,
      centerZ: lower.centerZ + (upper.centerZ - lower.centerZ) * t,
      exponent: lower.exponent + (upper.exponent - lower.exponent) * t,
    };
  }
  return { ...last, y };
}

export interface LoftOptions {
  readonly segments: number;
  /** Fill the first ring with a flat disc. A closed body part needs one, a hem does not. */
  readonly capStart?: boolean;
  readonly capEnd?: boolean;
}

/**
 * Loft a stack of rings into a tube.
 *
 * Vertex order is ring-major, which is what makes two lofts with the same ring and
 * segment counts share a topology, and therefore what makes a morph target between two
 * body sizes a plain position subtraction.
 */
export function loft(rings: readonly Ring[], options: LoftOptions): MeshData {
  const { segments, capStart = false, capEnd = false } = options;
  if (rings.length < 2) throw new Error('a loft needs at least two rings');
  const shellVertices = rings.length * segments;
  const capVertices = (capStart ? segments + 1 : 0) + (capEnd ? segments + 1 : 0);
  const positions = new Float32Array((shellVertices + capVertices) * 3);
  const uvs = new Float32Array((shellVertices + capVertices) * 2);
  const quads = (rings.length - 1) * segments;
  const capTriangles = (capStart ? segments : 0) + (capEnd ? segments : 0);
  const indices = new Uint32Array(quads * 6 + capTriangles * 3);

  const spans: number[] = [0];
  for (let r = 1; r < rings.length; r += 1) {
    const previous = rings[r - 1];
    const current = rings[r];
    if (!previous || !current) continue;
    spans.push((spans[r - 1] ?? 0) + Math.abs(current.y - previous.y));
  }
  const totalSpan = spans[spans.length - 1] ?? 1;

  for (let r = 0; r < rings.length; r += 1) {
    const ring = rings[r];
    if (!ring) continue;
    const points = ringPoints(ring, segments);
    const v = (spans[r] ?? 0) / (totalSpan || 1);
    for (let s = 0; s < segments; s += 1) {
      const index = r * segments + s;
      positions[index * 3] = points[s * 2] ?? 0;
      positions[index * 3 + 1] = ring.y;
      positions[index * 3 + 2] = points[s * 2 + 1] ?? 0;
      uvs[index * 2] = s / segments;
      uvs[index * 2 + 1] = v;
    }
  }

  let cursor = 0;
  for (let r = 0; r < rings.length - 1; r += 1) {
    for (let s = 0; s < segments; s += 1) {
      const next = (s + 1) % segments;
      const a = r * segments + s;
      const b = r * segments + next;
      const c = (r + 1) * segments + next;
      const d = (r + 1) * segments + s;
      indices[cursor] = a;
      indices[cursor + 1] = d;
      indices[cursor + 2] = c;
      indices[cursor + 3] = a;
      indices[cursor + 4] = c;
      indices[cursor + 5] = b;
      cursor += 6;
    }
  }

  let vertexCursor = shellVertices;
  const cap = (ringIndex: number, upward: boolean): void => {
    const ring = rings[ringIndex];
    if (!ring) return;
    const points = ringPoints(ring, segments);
    const center = vertexCursor;
    positions[center * 3] = ring.centerX;
    positions[center * 3 + 1] = ring.y;
    positions[center * 3 + 2] = ring.centerZ;
    uvs[center * 2] = 0.5;
    uvs[center * 2 + 1] = 0.5;
    vertexCursor += 1;
    const rim = vertexCursor;
    for (let s = 0; s < segments; s += 1) {
      const index = rim + s;
      positions[index * 3] = points[s * 2] ?? 0;
      positions[index * 3 + 1] = ring.y;
      positions[index * 3 + 2] = points[s * 2 + 1] ?? 0;
      uvs[index * 2] = s / segments;
      uvs[index * 2 + 1] = upward ? 1 : 0;
    }
    vertexCursor += segments;
    for (let s = 0; s < segments; s += 1) {
      const next = (s + 1) % segments;
      indices[cursor] = center;
      indices[cursor + 1] = upward ? rim + s : rim + next;
      indices[cursor + 2] = upward ? rim + next : rim + s;
      cursor += 3;
    }
  };
  if (capStart) cap(0, false);
  if (capEnd) cap(rings.length - 1, true);

  return { positions, uvs, indices, normals: computeNormals(positions, indices) };
}

/** Area-weighted vertex normals. The weighting is what keeps the hip crease smooth. */
export function computeNormals(
  positions: Float32Array,
  indices: Uint32Array,
): Float32Array {
  const normals = new Float32Array(positions.length);
  for (let i = 0; i < indices.length; i += 3) {
    const a = (indices[i] ?? 0) * 3;
    const b = (indices[i + 1] ?? 0) * 3;
    const c = (indices[i + 2] ?? 0) * 3;
    const abx = (positions[b] ?? 0) - (positions[a] ?? 0);
    const aby = (positions[b + 1] ?? 0) - (positions[a + 1] ?? 0);
    const abz = (positions[b + 2] ?? 0) - (positions[a + 2] ?? 0);
    const acx = (positions[c] ?? 0) - (positions[a] ?? 0);
    const acy = (positions[c + 1] ?? 0) - (positions[a + 1] ?? 0);
    const acz = (positions[c + 2] ?? 0) - (positions[a + 2] ?? 0);
    const nx = aby * acz - abz * acy;
    const ny = abz * acx - abx * acz;
    const nz = abx * acy - aby * acx;
    for (const offset of [a, b, c]) {
      normals[offset] = (normals[offset] ?? 0) + nx;
      normals[offset + 1] = (normals[offset + 1] ?? 0) + ny;
      normals[offset + 2] = (normals[offset + 2] ?? 0) + nz;
    }
  }
  for (let i = 0; i < normals.length; i += 3) {
    const length = Math.hypot(normals[i] ?? 0, normals[i + 1] ?? 0, normals[i + 2] ?? 0);
    if (length === 0) continue;
    normals[i] = (normals[i] ?? 0) / length;
    normals[i + 1] = (normals[i + 1] ?? 0) / length;
    normals[i + 2] = (normals[i + 2] ?? 0) / length;
  }
  return normals;
}

/** Concatenate parts into one mesh, re-basing each part's indices. */
export function mergeMeshes(parts: readonly MeshData[]): MeshData {
  const vertexCount = parts.reduce((sum, part) => sum + part.positions.length / 3, 0);
  const indexCount = parts.reduce((sum, part) => sum + part.indices.length, 0);
  const positions = new Float32Array(vertexCount * 3);
  const normals = new Float32Array(vertexCount * 3);
  const uvs = new Float32Array(vertexCount * 2);
  const indices = new Uint32Array(indexCount);
  let vertexOffset = 0;
  let indexOffset = 0;
  for (const part of parts) {
    positions.set(part.positions, vertexOffset * 3);
    normals.set(part.normals, vertexOffset * 3);
    uvs.set(part.uvs, vertexOffset * 2);
    for (let i = 0; i < part.indices.length; i += 1) {
      indices[indexOffset + i] = (part.indices[i] ?? 0) + vertexOffset;
    }
    vertexOffset += part.positions.length / 3;
    indexOffset += part.indices.length;
  }
  return { positions, normals, uvs, indices };
}

/**
 * Position deltas from one mesh to another of the same topology.
 *
 * This is the morph target of ADR-0003 in its smallest honest form. Body size in the
 * viewer is a vertex blend across these, so changing size costs no network request.
 */
export function morphDelta(base: MeshData, target: MeshData): Float32Array {
  if (base.positions.length !== target.positions.length) {
    throw new Error('morph targets must share a topology');
  }
  const delta = new Float32Array(base.positions.length);
  for (let i = 0; i < delta.length; i += 1) {
    delta[i] = (target.positions[i] ?? 0) - (base.positions[i] ?? 0);
  }
  return delta;
}

export interface SettleOptions {
  /** How far the garment starts above its resting pose, metres. */
  readonly liftM: number;
  /** How much wider it starts, as a multiplier on the distance from the figure's axis. */
  readonly expand: number;
}

/**
 * The pose a garment falls from.
 *
 * Spec 14.2 keeps the last frames of the solver's settle and plays them on load, so a
 * garment lands rather than pops. Until the solver exists there is no simulated tail to
 * keep, so this stands in for it: the same mesh, lifted and opened out, blended to rest
 * over the drape duration. Topology is untouched, which is what lets the viewer treat it
 * as a plain vertex blend.
 */
export function settleStart(mesh: MeshData, options: SettleOptions): MeshData {
  const positions = new Float32Array(mesh.positions.length);
  for (let i = 0; i < positions.length; i += 3) {
    positions[i] = (mesh.positions[i] ?? 0) * options.expand;
    positions[i + 1] = (mesh.positions[i + 1] ?? 0) + options.liftM;
    positions[i + 2] = (mesh.positions[i + 2] ?? 0) * options.expand;
  }
  return {
    positions,
    uvs: mesh.uvs,
    indices: mesh.indices,
    normals: computeNormals(positions, mesh.indices),
  };
}
