import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import type { BodySize, DeviceTier } from '@talla/shared';
import type { GarmentBlockId, LayerDepth, MeshData } from '@talla/blocks';
import {
  FIGURE_BOUNDS,
  bodyMesh,
  garmentFabric,
  garmentMesh,
  settleStart,
} from '@talla/blocks';

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

/** Vertical field of view, degrees. Narrow fashion editorial framing (28 deg). */
const FIELD_OF_VIEW = 28;

/** How much of the stage's height the figure fills at rest. */
const FIGURE_FILL = 0.88;

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
 * Procedural high-resolution (512x512) micro-surface normal textures.
 * Tailored for jersey knit, denim twill, linen slub, and satin silk.
 */
function createFabricNormalTexture(
  kind: 'jersey' | 'twill' | 'linen' | 'silk',
): THREE.CanvasTexture | undefined {
  if (typeof document === 'undefined') return undefined;
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return undefined;

  const imgData = ctx.createImageData(size, size);
  const data = imgData.data;

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let nx = 0;
      let ny = 0;

      if (kind === 'twill') {
        // Crisp 45-degree diagonal twill with fine transverse weave
        const diag = Math.sin(((x + y) / 5) * Math.PI);
        const cross = Math.sin(((x - y) / 3) * Math.PI) * 0.25;
        nx = diag * 0.5;
        ny = (diag + cross) * 0.5;
      } else if (kind === 'linen') {
        // Organic irregular warp and weft slub linen
        const warp = Math.sin((x / 4.5 + Math.sin(y / 18) * 0.4) * Math.PI);
        const weft = Math.sin((y / 4.5 + Math.sin(x / 18) * 0.4) * Math.PI);
        nx = warp * 0.45;
        ny = weft * 0.45;
      } else if (kind === 'silk') {
        // Micro-fine satin weave
        const grainX = Math.sin(x * 0.8) * 0.12;
        const grainY = Math.cos(y * 0.8) * 0.12;
        nx = grainX;
        ny = grainY;
      } else {
        // Jersey knit interlocked loops
        const loopX = Math.sin((x / 3) * Math.PI);
        const loopY = Math.cos((y / 4.5) * Math.PI);
        const rib = Math.sin((x / 6) * Math.PI) * 0.2;
        nx = (loopX + rib) * 0.35;
        ny = loopY * 0.4;
      }

      const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
      const idx = (y * size + x) * 4;
      data[idx] = Math.round((nx * 0.5 + 0.5) * 255);
      data[idx + 1] = Math.round((ny * 0.5 + 0.5) * 255);
      data[idx + 2] = Math.round((nz * 0.5 + 0.5) * 255);
      data[idx + 3] = 255;
    }
  }

  ctx.putImageData(imgData, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(24, 24);
  texture.needsUpdate = true;
  return texture;
}

/**
 * Soft radial falloff texture for the studio ground contact shadow.
 */
function createContactShadowTexture(): THREE.CanvasTexture | undefined {
  if (typeof document === 'undefined') return undefined;
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return undefined;

  const center = size / 2;
  const gradient = ctx.createRadialGradient(center, center, 0, center, center, center);
  gradient.addColorStop(0, 'rgba(16, 18, 20, 0.42)');
  gradient.addColorStop(0.35, 'rgba(16, 18, 20, 0.22)');
  gradient.addColorStop(0.7, 'rgba(16, 18, 20, 0.06)');
  gradient.addColorStop(1, 'rgba(16, 18, 20, 0)');

  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
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
    powerPreference: 'high-performance',
  });

  let disposed = false;
  let frame = 0;

  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2.5));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;
  renderer.shadowMap.enabled = options.tier === 'A';
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.domElement.setAttribute('role', 'img');
  host.appendChild(renderer.domElement);

  // Procedural fabric normal maps
  const jerseyNormal = createFabricNormalTexture('jersey');
  const twillNormal = createFabricNormalTexture('twill');
  const linenNormal = createFabricNormalTexture('linen');
  const silkNormal = createFabricNormalTexture('silk');
  const contactTexture = createContactShadowTexture();

  const normalMapFor = (
    kind: 'jersey' | 'twill' | 'linen' | 'silk',
  ): THREE.CanvasTexture | undefined => {
    switch (kind) {
      case 'twill':
        return twillNormal;
      case 'linen':
        return linenNormal;
      case 'silk':
        return silkNormal;
      case 'jersey':
      default:
        return jerseyNormal;
    }
  };

  const scene = new THREE.Scene();

  // Generate studio ambient reflections via PMREM RoomEnvironment
  const pmremGenerator = new THREE.PMREMGenerator(renderer);
  pmremGenerator.compileEquirectangularShader();
  const roomEnv = new RoomEnvironment();
  const envTexture = pmremGenerator.fromScene(roomEnv, 0.04).texture;
  scene.environment = envTexture;
  scene.environmentIntensity = 0.85;

  const camera = new THREE.PerspectiveCamera(FIELD_OF_VIEW, 1, 0.05, 50);
  const figureHeight = FIGURE_BOUNDS.top - FIGURE_BOUNDS.bottom;
  const centerY = (FIGURE_BOUNDS.top + FIGURE_BOUNDS.bottom) / 2;
  const distance =
    figureHeight / FIGURE_FILL / (2 * Math.tan((FIELD_OF_VIEW / 2) * (Math.PI / 180)));
  const target = new THREE.Vector3(0, centerY, 0);
  camera.position.set(0, centerY + 0.05, distance);

  // Five-point fashion photography studio lighting rig
  const hemiLight = new THREE.HemisphereLight(style.lightColor, style.groundColor, 0.95);
  scene.add(hemiLight);

  // 1. Key Light: High-angle directional light with soft shadow mapping
  const keyLight = new THREE.DirectionalLight(style.lightColor, 3.4);
  keyLight.position.set(2.5, 3.8, 3.2);
  keyLight.castShadow = options.tier === 'A';
  keyLight.shadow.mapSize.set(2048, 2048);
  keyLight.shadow.camera.near = 0.1;
  keyLight.shadow.camera.far = 10;
  keyLight.shadow.camera.left = -1.2;
  keyLight.shadow.camera.right = 1.2;
  keyLight.shadow.camera.top = 2.2;
  keyLight.shadow.camera.bottom = -0.3;
  keyLight.shadow.bias = -0.00015;
  keyLight.shadow.radius = 2.5;
  scene.add(keyLight);

  // 2. Fill Light: Softer cool-side light to balance contrast
  const fillLight = new THREE.DirectionalLight(style.lightColor, 1.4);
  fillLight.position.set(-2.8, 2.2, 2.4);
  scene.add(fillLight);

  // 3. High Rim/Contour Light: Dramatic separation of figure silhouette from background
  const rimLight = new THREE.DirectionalLight(style.lightColor, 3.2);
  rimLight.position.set(-1.6, 3.2, -3.4);
  scene.add(rimLight);

  // 4. Secondary Contour/Kick Light
  const kickLight = new THREE.DirectionalLight(style.lightColor, 1.8);
  kickLight.position.set(2.2, 2.4, -2.8);
  scene.add(kickLight);

  // 5. Soft Front/Chest Point Light
  const faceLight = new THREE.PointLight(style.lightColor, 0.5, 5, 1.8);
  faceLight.position.set(0, 1.8, 2.2);
  scene.add(faceLight);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.copy(target);
  controls.enableDamping = true;
  controls.dampingFactor = 0.06;
  controls.enablePan = false;
  controls.minDistance = distance * 0.55;
  controls.maxDistance = distance * 1.35;
  controls.minPolarAngle = Math.PI * 0.22;
  controls.maxPolarAngle = Math.PI * 0.62;
  controls.update();

  const figure = new THREE.Group();
  scene.add(figure);

  // Studio Ground Setup:
  // - A soft radial contact shadow disc that grounds the figure naturally
  // - A dynamic live shadow catcher on Tier A
  const groundGroup = new THREE.Group();
  scene.add(groundGroup);

  const contactGeometry = new THREE.PlaneGeometry(1.2, 1.2);
  const contactMaterial = new THREE.MeshBasicMaterial({
    ...(contactTexture ? { map: contactTexture } : {}),
    transparent: true,
    depthWrite: false,
    opacity: 0.85,
  });
  const contactMesh = new THREE.Mesh(contactGeometry, contactMaterial);
  contactMesh.rotation.x = -Math.PI / 2;
  contactMesh.position.y = FIGURE_BOUNDS.bottom - 0.002;
  groundGroup.add(contactMesh);

  const groundGeometry = new THREE.CircleGeometry(0.75, 64);
  const groundMaterial =
    options.tier === 'A'
      ? new THREE.ShadowMaterial({ color: 0x0a0c0e, opacity: 0.32 })
      : new THREE.MeshBasicMaterial({
          color: 0x0a0c0e,
          opacity: 0.1,
          transparent: true,
          depthWrite: false,
        });
  const ground = new THREE.Mesh(groundGeometry, groundMaterial);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = FIGURE_BOUNDS.bottom - 0.004;
  ground.receiveShadow = options.tier === 'A';
  groundGroup.add(ground);

  // Luxury retail display mannequin material: deep clearcoat + refined sheen
  const bodyGeometry = toGeometry(bodyMesh(options.size));
  const bodyMaterial = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(style.mannequinColor),
    roughness: 0.22,
    metalness: 0.05,
    clearcoat: 0.88,
    clearcoatRoughness: 0.12,
    sheen: 0.35,
    sheenColor: new THREE.Color(0xffffff),
    sheenRoughness: 0.3,
    reflectivity: 0.65,
  });
  const body: Piece = {
    geometry: bodyGeometry,
    mesh: new THREE.Mesh(bodyGeometry, bodyMaterial),
    blend: undefined,
  };
  body.mesh.castShadow = options.tier === 'A';
  body.mesh.receiveShadow = options.tier === 'A';
  figure.add(body.mesh);

  const worn = new Map<GarmentBlockId, Piece>();
  let currentSize = options.size;

  // Post-processing setup for Tier A: subtle bloom on highlights
  let composer: EffectComposer | undefined;
  let bloomPass: UnrealBloomPass | undefined;

  function initComposer(width: number, height: number): void {
    if (options.tier !== 'A' || typeof window === 'undefined') return;
    try {
      composer = new EffectComposer(renderer);
      composer.addPass(new RenderPass(scene, camera));
      bloomPass = new UnrealBloomPass(
        new THREE.Vector2(width, height),
        0.12, // subtle gleam on clearcoat and silk
        0.35, // blur radius
        0.88, // threshold
      );
      composer.addPass(bloomPass);
      composer.addPass(new OutputPass());
    } catch {
      composer = undefined;
      bloomPass = undefined;
    }
  }

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

    // Damped controls return true while camera momentum settles
    const controlsMoving = controls.update();

    if (composer && options.tier === 'A') {
      composer.render();
    } else {
      renderer.render(scene, camera);
    }

    if (running || controlsMoving) draw();
  }

  function startBlend(piece: Piece, to: Float32Array, durationMs: number): void {
    const current = piece.geometry.getAttribute('position').array as Float32Array;
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
    const wornLabels = next.map((garment) => garment.label).join('، ');
    renderer.domElement.setAttribute(
      'aria-label',
      next.length === 0
        ? `مانيكان بمقاس ${forSize} بدون قطع.`
        : `مانيكان بمقاس ${forSize} يرتدي: ${wornLabels}. اسحب للتدوير، أو استخدم أزرار التحكم تحت العرض.`,
    );
    if (forSize !== currentSize) {
      currentSize = forSize;
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
      const fabricPreset = garmentFabric(garment.blockId);
      const normalKind = fabricPreset.normalKind ?? 'jersey';
      const normalMap = normalMapFor(normalKind);
      const baseColor = new THREE.Color(garment.colorHex);
      const sheenColor = baseColor.clone().lerp(new THREE.Color(0xffffff), 0.35);

      const existing = worn.get(garment.blockId);
      if (existing) {
        const mat = existing.mesh.material as THREE.MeshPhysicalMaterial;
        mat.color.copy(baseColor);
        mat.sheenColor.copy(sheenColor);
        startBlend(existing, rest.positions, style.morphMs);
        continue;
      }

      const start = settleStart(rest, { liftM: SETTLE_LIFT_M, expand: SETTLE_EXPAND });
      const geometry = toGeometry(start);

      // Fabric-aware PBR material
      const normalScale = fabricPreset.normalScale ?? 0.45;
      const material = new THREE.MeshPhysicalMaterial({
        color: baseColor,
        roughness: fabricPreset.roughness ?? 0.76,
        metalness: 0,
        sheen: fabricPreset.sheen ?? 0.4,
        sheenRoughness: fabricPreset.sheenRoughness ?? 0.45,
        sheenColor,
        clearcoat: fabricPreset.clearcoat ?? 0,
        clearcoatRoughness: fabricPreset.clearcoatRoughness ?? 0,
        ...(normalMap
          ? {
              normalMap,
              normalScale: new THREE.Vector2(normalScale, normalScale),
            }
          : {}),
        side: THREE.DoubleSide,
      });

      const mesh = new THREE.Mesh(geometry, material);
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

  function resize(): void {
    const { width, height } = host.getBoundingClientRect();
    if (!width || !height) return;
    renderer.setSize(width, height);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();

    if (composer && options.tier === 'A') {
      composer.setSize(width, height);
      bloomPass?.setSize(width, height);
    }
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

  const { width: initW, height: initH } = host.getBoundingClientRect();
  if (initW && initH) {
    initComposer(initW, initH);
  }

  resize();
  dress(options.garments, options.size);
  if (composer && options.tier === 'A') {
    composer.render();
  } else {
    renderer.render(scene, camera);
  }

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
      jerseyNormal?.dispose();
      twillNormal?.dispose();
      linenNormal?.dispose();
      silkNormal?.dispose();
      contactTexture?.dispose();
      contactGeometry.dispose();
      contactMaterial.dispose();
      body.geometry.dispose();
      bodyMaterial.dispose();
      groundGeometry.dispose();
      groundMaterial.dispose();
      roomEnv.dispose();
      envTexture.dispose();
      pmremGenerator.dispose();
      composer?.dispose();
      bloomPass?.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
    },
  };
}
