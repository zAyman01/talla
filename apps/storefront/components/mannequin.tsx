'use client';

/**
 * The mannequin viewer.
 *
 * A client leaf that owns its canvas and its own render loop, per the one hard
 * architectural rule in docs/frontend/README.md section 3. Nothing outside it animates
 * while it is mounted, and no continuous value passes through React state: size blends
 * and drape settles run inside the loop against refs.
 *
 * It renders on demand. A still mannequin costs zero frames, which is the difference
 * between a warm phone and a thermally throttled one five minutes into a session
 * (spec 11.4).
 */

import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { BodySize } from '@talla/shared';
import type { GarmentBlockId, LayerDepth, MeshData } from '@talla/blocks';
import { TIER_BUDGET, probeTier } from '@talla/viewer';
import { FIGURE_BOUNDS, bodyMesh, garmentMesh, settleStart } from '@talla/blocks';

export interface DressedGarment {
  readonly blockId: GarmentBlockId;
  /** Merchandise colour, from the catalog. Garment colour is data, never a token. */
  readonly colorHex: string;
  readonly layer: LayerDepth;
  readonly label: string;
}

interface MannequinProps {
  readonly size: BodySize;
  readonly garments: readonly DressedGarment[];
  /** Called when this device cannot render, so the page can fall back to photographs. */
  readonly onUnavailable: () => void;
}

/** The settle starts here and blends to rest: lifted, and opened out (spec 14.2). */
const SETTLE_LIFT_M = 0.05;
const SETTLE_EXPAND = 1.06;

/** Vertical field of view, degrees. Narrow, so the figure reads with little perspective. */
const FIELD_OF_VIEW = 32;

/** How much of the stage's height the figure fills at rest. */
const FIGURE_FILL = 0.84;

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

function readMs(styles: CSSStyleDeclaration, name: string, fallback: number): number {
  const raw = styles.getPropertyValue(name).trim();
  const parsed = Number.parseFloat(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toGeometry(data: MeshData): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(data.positions, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(data.normals, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(data.uvs, 2));
  geometry.setIndex(new THREE.BufferAttribute(data.indices, 1));
  return geometry;
}

export function Mannequin({ size, garments, onUnavailable }: MannequinProps): ReactNode {
  const host = useRef<HTMLDivElement>(null);
  const rotate = useRef<(radians: number) => void>(() => undefined);
  const recenter = useRef<() => void>(() => undefined);
  const dress = useRef<(next: readonly DressedGarment[], size: BodySize) => void>(
    () => undefined,
  );
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const element = host.current;
    if (!element) return;

    /**
     * The tier decides whether there is a viewer at all (spec 11.2).
     *
     * Probed here rather than guessed from a user agent, and tier C never creates a
     * context: a software rasteriser or a data-saver preference is answered before a
     * WebGL canvas exists, not after it stutters. The turntable that tier C is supposed
     * to show arrives with the asset pipeline; until then the page falls back to the
     * photographs it already has, which is the same code path.
     */
    const tier = probeTier();
    if (TIER_BUDGET[tier].usesTurntable) {
      setFailed(true);
      onUnavailable();
      return;
    }

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true,
        powerPreference: 'low-power',
      });
    } catch {
      setFailed(true);
      onUnavailable();
      return;
    }

    let disposed = false;
    let frame = 0;
    const styles = getComputedStyle(element);
    const drapeMs = readMs(styles, '--dur-drape', 380);
    const morphMs = readMs(styles, '--dur-morph', 200);
    const mannequinColor = styles.getPropertyValue('--mannequin').trim();
    const lightColor = styles.getPropertyValue('--studio-light-color').trim();
    const groundColor = styles.getPropertyValue('--studio-ground-color').trim();

    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.NoToneMapping;
    renderer.domElement.setAttribute('role', 'img');
    element.appendChild(renderer.domElement);

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

    scene.add(new THREE.HemisphereLight(lightColor, groundColor, 2.1));
    const key = new THREE.DirectionalLight(lightColor, 1.9);
    key.position.set(2.2, 3.4, 3.6);
    scene.add(key);
    const fill = new THREE.DirectionalLight(lightColor, 0.7);
    fill.position.set(-2.6, 1.4, -2.2);
    scene.add(fill);

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

    const bodyGeometry = toGeometry(bodyMesh(size));
    const body: Piece = {
      geometry: bodyGeometry,
      mesh: new THREE.Mesh(
        bodyGeometry,
        new THREE.MeshStandardMaterial({
          color: new THREE.Color(mannequinColor),
          roughness: 0.92,
          metalness: 0,
        }),
      ),
      blend: undefined,
    };
    figure.add(body.mesh);

    const worn = new Map<GarmentBlockId, Piece>();
    let currentSize = size;

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

    dress.current = (next, forSize) => {
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
        startBlend(body, bodyMesh(forSize).positions, morphMs);
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
          startBlend(existing, rest.positions, morphMs);
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
        mesh.renderOrder = garment.layer === 'over' ? 2 : 1;
        figure.add(mesh);
        const piece: Piece = { mesh, geometry, blend: undefined };
        worn.set(garment.blockId, piece);
        startBlend(piece, rest.positions, drapeMs);
      }
      draw();
    };

    rotate.current = (radians) => {
      figure.rotation.y += radians;
      draw();
    };
    recenter.current = () => {
      controls.reset();
      controls.target.copy(target);
      figure.rotation.y = 0;
      controls.update();
      draw();
    };

    controls.addEventListener('change', draw);
    const observer = new ResizeObserver(() => {
      const { width, height } = element.getBoundingClientRect();
      if (!width || !height) return;
      renderer.setSize(width, height);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      draw();
    });
    observer.observe(element);

    // A lost context on the Instagram WebView is expected, not exceptional. Fall back to
    // the photographs rather than leaving a blank canvas (spec 11.2).
    const onContextLost = (event: Event): void => {
      event.preventDefault();
      setFailed(true);
      onUnavailable();
    };
    renderer.domElement.addEventListener('webglcontextlost', onContextLost);

    dress.current(garments, size);
    renderer.render(scene, camera);

    return () => {
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
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
      rotate.current = () => undefined;
      recenter.current = () => undefined;
      dress.current = () => undefined;
    };
    // The scene is built once and driven through refs afterwards. Rebuilding it when a
    // prop changes would tear down the WebGL context on a size tap, which is the
    // opposite of the free size change ADR-0003 exists to deliver. The props read here
    // are only the opening state; every later change arrives through `dress`.
  }, []);

  useEffect(() => {
    dress.current(garments, size);
  }, [garments, size]);

  if (failed) return null;

  // The stage holds the canvas and nothing else. Controls sit below it, never floating
  // over the garment (docs/frontend/design-system.md, Viewer).
  return (
    <>
      <div className="viewer-stage">
        <div className="canvas-host" ref={host} />
      </div>
      <div className="viewer-controls">
        <button
          type="button"
          onClick={() => {
            rotate.current(-Math.PI / 6);
          }}
          aria-label="تدوير المانيكان إلى اليسار"
        >
          ↶
        </button>
        <button
          type="button"
          onClick={() => {
            recenter.current();
          }}
        >
          إعادة العرض
        </button>
        <button
          type="button"
          onClick={() => {
            rotate.current(Math.PI / 6);
          }}
          aria-label="تدوير المانيكان إلى اليمين"
        >
          ↷
        </button>
      </div>
    </>
  );
}
