import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { BodySize, DeviceTier } from '@talla/shared';
import type { GarmentBlockId, LayerDepth, MeshData } from '@talla/blocks';
import { FIGURE_BOUNDS, bodyMesh, garmentMesh, settleStart } from '@talla/blocks';

/**
 * The mannequin scene: a WebGL figure that wears blocks and settles them.
 *
 * Framework free on purpose. Spec section 5 gives this module the browser 3D, and a
 * renderer that reaches for React state is a renderer that cannot be reused by the admin
 * preview, cannot be driven by a test harness, and cannot be reasoned about frame by
 * frame. What a caller gets back is a handle with four methods. What it supplies is a
 * host element and the design values it owns: nothing here reads a token, a route, or a
 * store.
 *
 * It renders on demand. A still mannequin costs zero frames, which is the difference
 * between a warm phone and a thermally throttled one five minutes into a session
 * (spec 11.4).
 *
 * The geometry comes from the parametric block library, which ADR-0018 is explicit about
 * being a stopgap until the asset pipeline publishes real meshes. When that lands, the
 * source of the vertices changes and the shape of this file does not.
 */

export interface DressedGarment {
  readonly blockId: GarmentBlockId;
  /** Merchandise colour, from the catalog. Garment colour is data, never a token. */
  readonly colorHex: string;
  readonly layer: LayerDepth;
  /** The garment's Arabic name, read out as part of the canvas label. */
  readonly label: string;
}

/**
 * The design values the scene needs, supplied by the caller.
 *
 * Passed in rather than read here, because every one of them is already decided in
 * docs/frontend/tokens.css and this module has no business knowing the names they are
 * stored under.
 */
export interface SceneStyle {
  /** `--dur-drape`, milliseconds. How long a garment takes to settle. */
  readonly drapeMs: number;
  /** `--dur-morph`, milliseconds. How long a size change takes to blend. */
  readonly morphMs: number;
  /** `--mannequin`. The figure itself, never a garment colour. */
  readonly mannequinColor: string;
  /** `--studio-light-color`. */
  readonly lightColor: string;
  /** `--studio-ground-color`. */
  readonly groundColor: string;
}

export interface SceneOptions {
  /** The element the canvas is appended to. Its box drives the render size. */
  readonly host: HTMLElement;
  readonly size: BodySize;
  readonly garments: readonly DressedGarment[];
  readonly style: SceneStyle;
  /** Device budget already measured by the caller. Only tier A renders live shadows. */
  readonly tier: DeviceTier;
  /**
   * A lost context in the Instagram WebView is expected, not exceptional. The caller
   * falls back to photographs; the scene only reports it (spec 11.2).
   */
  readonly onContextLost: () => void;
}

export interface MannequinScene {
  /** Re-dress the figure. Interruptible: a call mid-settle continues from the pose on screen. */
  dress(garments: readonly DressedGarment[], size: BodySize): void;
  rotate(radians: number): void;
  setView(view: MannequinView): void;
  recenter(): void;
  dispose(): void;
}

export type MannequinView = 'front' | 'side' | 'back';

/** The settle starts here and blends to rest: lifted, and opened out (spec 14.2). */
const SETTLE_LIFT_M = 0.05;
const SETTLE_EXPAND = 1.06;

/** Vertical field of view, degrees. Narrow, so the figure reads with little perspective. */
const FIELD_OF_VIEW = 32;

/** How much of the stage's height the figure fills at rest. */
const FIGURE_FILL = 0.9;

interface Blend {
  readonly from: Float32Array;
  readonly to: Float32Array;
  readonly startedAt: number;
  readonly durationMs: number;
}

interface Piece {
  readonly mesh: THREE.Mesh;
  readonly geometry: THREE.BufferGeometry;
  blend: Blend | undefined;
}

/** Decelerate, matching --ease-enter. Cloth lands, it does not arrive at constant speed. */
function easeOut(t: number): number {
  return 1 - (1 - t) ** 3;
}

function toGeometry(data: MeshData): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(data.positions, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(data.normals, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(data.uvs, 2));
  geometry.setIndex(new THREE.BufferAttribute(data.indices, 1));
  return geometry;
}

/**
 * Build the scene and draw its first frame.
 *
 * Throws if the device will not give up a WebGL context. Callers settle the tier before
 * calling, so by the time execution reaches here a refusal is a genuine failure rather
 * than a device that was never going to render at all (`chooseTier`).
 */
export function createMannequinScene(options: SceneOptions): MannequinScene {
  const { host, style } = options;
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: true,
    powerPreference: 'low-power',
  });

  let disposed = false;
  let frame = 0;

  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.shadowMap.enabled = options.tier === 'A';
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.domElement.setAttribute('role', 'img');
  host.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(FIELD_OF_VIEW, 1, 0.05, 50);
  // Frame the figure that exists, not the stature it is graded for. The form is cut at
  // the neck, so aiming at the waist puts the hem off the bottom of the stage.
  const figureHeight = FIGURE_BOUNDS.top - FIGURE_BOUNDS.bottom;
  const centerY = (FIGURE_BOUNDS.top + FIGURE_BOUNDS.bottom) / 2;
  const distance =
    figureHeight / FIGURE_FILL / (2 * Math.tan((FIELD_OF_VIEW / 2) * (Math.PI / 180)));
  const target = new THREE.Vector3(0, centerY, 0);
  camera.position.set(0, centerY + 0.06, distance);

  // A neutral studio rig gives the near-black shell enough highlights to describe the
  // waist, face and back from every angle without tinting the garment colours.
  scene.add(new THREE.HemisphereLight(style.lightColor, style.groundColor, 1.35));
  const key = new THREE.DirectionalLight(style.lightColor, 3.1);
  key.position.set(2.4, 3.2, 3.8);
  key.castShadow = options.tier === 'A';
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.camera.near = 0.1;
  key.shadow.camera.far = 8;
  key.shadow.camera.left = -1.1;
  key.shadow.camera.right = 1.1;
  key.shadow.camera.top = 2.1;
  key.shadow.camera.bottom = -0.2;
  key.shadow.bias = -0.0004;
  scene.add(key);
  const fill = new THREE.DirectionalLight(style.lightColor, 1.25);
  fill.position.set(-2.6, 1.7, 2.1);
  scene.add(fill);
  const rim = new THREE.DirectionalLight(style.lightColor, 2.45);
  rim.position.set(-1.8, 2.5, -3.6);
  scene.add(rim);
  const face = new THREE.PointLight(style.lightColor, 0.55, 5, 1.4);
  face.position.set(0, 1.75, 2.2);
  scene.add(face);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.copy(target);
  controls.enableDamping = false;
  controls.enablePan = false;
  controls.minDistance = distance * 0.55;
  controls.maxDistance = distance * 1.35;
  // Never from underneath. Below the hem the loft is open, and a buyer who finds that
  // hole stops believing the render.
  controls.minPolarAngle = Math.PI * 0.22;
  controls.maxPolarAngle = Math.PI * 0.62;
  controls.update();

  const figure = new THREE.Group();
  scene.add(figure);

  const groundGeometry = new THREE.CircleGeometry(0.34, 64);
  const groundMaterial =
    options.tier === 'A'
      ? new THREE.ShadowMaterial({ color: 0x08090a, opacity: 0.24 })
      : new THREE.MeshBasicMaterial({
          color: 0x08090a,
          opacity: 0.11,
          transparent: true,
          depthWrite: false,
        });
  const ground = new THREE.Mesh(groundGeometry, groundMaterial);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = FIGURE_BOUNDS.bottom - 0.004;
  ground.receiveShadow = options.tier === 'A';
  scene.add(ground);

  const bodyGeometry = toGeometry(bodyMesh(options.size));
  const body: Piece = {
    geometry: bodyGeometry,
    mesh: new THREE.Mesh(
      bodyGeometry,
      new THREE.MeshPhysicalMaterial({
        color: new THREE.Color(style.mannequinColor),
        roughness: 0.42,
        metalness: 0,
        clearcoat: 0.34,
        clearcoatRoughness: 0.28,
      }),
    ),
    blend: undefined,
  };
  body.mesh.castShadow = options.tier === 'A';
  body.mesh.receiveShadow = options.tier === 'A';
  figure.add(body.mesh);

  const worn = new Map<GarmentBlockId, Piece>();
  let currentSize = options.size;

  const draw = (): void => {
    if (disposed || frame) return;
    frame = requestAnimationFrame(step);
  };

  function applyBlend(piece: Piece, now: number): boolean {
    const blend = piece.blend;
    if (!blend) return false;
    const attribute = piece.geometry.getAttribute('position');
    const positions = attribute.array as Float32Array;
    const elapsed = now - blend.startedAt;
    const t = blend.durationMs <= 0 ? 1 : Math.min(elapsed / blend.durationMs, 1);
    const eased = easeOut(t);
    for (let i = 0; i < positions.length; i += 1) {
      const from = blend.from[i] ?? 0;
      positions[i] = from + ((blend.to[i] ?? 0) - from) * eased;
    }
    attribute.needsUpdate = true;
    piece.geometry.computeVertexNormals();
    if (t >= 1) piece.blend = undefined;
    return t < 1;
  }

  function step(): void {
    frame = 0;
    if (disposed) return;
    const now = performance.now();
    let running = applyBlend(body, now);
    for (const piece of worn.values()) {
      if (applyBlend(piece, now)) running = true;
    }
    renderer.render(scene, camera);
    if (running) draw();
  }

  function startBlend(piece: Piece, to: Float32Array, durationMs: number): void {
    const current = piece.geometry.getAttribute('position').array as Float32Array;
    // Blending from wherever the mesh is right now is what makes the settle
    // interruptible: a second tap mid-fall continues from the pose on screen
    // rather than snapping back to the start (spec 14.2).
    piece.blend = {
      from: Float32Array.from(current),
      to,
      startedAt: performance.now(),
      durationMs,
    };
    draw();
  }

  function dress(next: readonly DressedGarment[], forSize: BodySize): void {
    if (disposed) return;
    // A canvas has no readable content, so the label has to carry what is on the
    // figure. It is the only description a screen reader can get from this view.
    const wornLabels = next.map((garment) => garment.label).join('، ');
    renderer.domElement.setAttribute(
      'aria-label',
      next.length === 0
        ? `مانيكان بمقاس ${forSize} بدون قطع.`
        : `مانيكان بمقاس ${forSize} يرتدي: ${wornLabels}. اسحب للتدوير، أو استخدم أزرار التحكم تحت العرض.`,
    );
    if (forSize !== currentSize) {
      currentSize = forSize;
      // No fetch. Body size is a vertex blend across the morph target, which is the
      // whole point of shipping sizes as deltas (ADR-0003).
      startBlend(body, bodyMesh(forSize).positions, style.morphMs);
    }
    const wanted = new Set(next.map((garment) => garment.blockId));
    for (const [id, piece] of worn) {
      if (wanted.has(id)) continue;
      figure.remove(piece.mesh);
      piece.geometry.dispose();
      (piece.mesh.material as THREE.Material).dispose();
      worn.delete(id);
    }
    for (const garment of next) {
      const rest = garmentMesh(garment.blockId, forSize, garment.layer);
      const existing = worn.get(garment.blockId);
      if (existing) {
        (existing.mesh.material as THREE.MeshStandardMaterial).color.set(
          garment.colorHex,
        );
        startBlend(existing, rest.positions, style.morphMs);
        continue;
      }
      const start = settleStart(rest, { liftM: SETTLE_LIFT_M, expand: SETTLE_EXPAND });
      const geometry = toGeometry(start);
      const mesh = new THREE.Mesh(
        geometry,
        new THREE.MeshStandardMaterial({
          color: new THREE.Color(garment.colorHex),
          roughness: 0.78,
          metalness: 0,
          side: THREE.DoubleSide,
        }),
      );
      mesh.castShadow = options.tier === 'A';
      mesh.receiveShadow = options.tier === 'A';
      mesh.renderOrder = garment.layer === 'over' ? 2 : 1;
      figure.add(mesh);
      const piece: Piece = { mesh, geometry, blend: undefined };
      worn.set(garment.blockId, piece);
      startBlend(piece, rest.positions, style.drapeMs);
    }
    draw();
  }

  /**
   * Match the canvas to its host.
   *
   * Called once before the first frame, and not left to the observer alone. A renderer
   * starts at Three's default 300x150, the stage stretches it to fill, and the gap
   * between the canvas appearing and the first observation is a frame of a figure at the
   * wrong proportions. One frame on a fast machine; long enough to see on a phone
   * loading the engine over 3G.
   */
  function resize(): void {
    const { width, height } = host.getBoundingClientRect();
    if (!width || !height) return;
    renderer.setSize(width, height);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }

  const observer = new ResizeObserver(() => {
    resize();
    draw();
  });
  observer.observe(host);

  const onContextLost = (event: Event): void => {
    event.preventDefault();
    options.onContextLost();
  };
  renderer.domElement.addEventListener('webglcontextlost', onContextLost);
  controls.addEventListener('change', draw);

  resize();
  dress(options.garments, options.size);
  renderer.render(scene, camera);

  return {
    dress,
    rotate(radians: number): void {
      figure.rotation.y += radians;
      draw();
    },
    setView(view: MannequinView): void {
      figure.rotation.y = view === 'front' ? 0 : view === 'side' ? Math.PI / 2 : Math.PI;
      draw();
    },
    recenter(): void {
      controls.reset();
      controls.target.copy(target);
      figure.rotation.y = 0;
      controls.update();
      draw();
    },
    dispose(): void {
      disposed = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      controls.removeEventListener('change', draw);
      controls.dispose();
      renderer.domElement.removeEventListener('webglcontextlost', onContextLost);
      for (const piece of worn.values()) {
        piece.geometry.dispose();
        (piece.mesh.material as THREE.Material).dispose();
      }
      worn.clear();
      body.geometry.dispose();
      (body.mesh.material as THREE.Material).dispose();
      groundGeometry.dispose();
      groundMaterial.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
    },
  };
}
