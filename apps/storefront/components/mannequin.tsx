'use client';

/**
 * The mannequin viewer's React surface.
 *
 * A client leaf that owns its canvas host and nothing else, per the one hard
 * architectural rule in docs/frontend/README.md section 3. Nothing outside it animates
 * while it is mounted, and no continuous value passes through React state: size blends
 * and drape settles run inside the scene's own loop, in `@talla/viewer`.
 *
 * What lives here is the part that is genuinely this app's: the tier gate that decides
 * whether a viewer exists at all, the design tokens the scene is drawn with, and the
 * controls under the stage. The WebGL is the viewer module's, which is what spec
 * section 5 says and what makes it reusable by the admin preview.
 */

import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { BodySize } from '@talla/shared';
import { TIER_BUDGET, createMannequinScene, probeTier } from '@talla/viewer';
import type { DressedGarment, MannequinScene, SceneStyle } from '@talla/viewer';

interface MannequinProps {
  readonly size: BodySize;
  readonly garments: readonly DressedGarment[];
  /** Called when this device cannot render, so the page can fall back to photographs. */
  readonly onUnavailable: () => void;
}

function readMs(styles: CSSStyleDeclaration, name: string, fallback: number): number {
  const raw = styles.getPropertyValue(name).trim();
  const parsed = Number.parseFloat(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/**
 * Every value the scene is drawn with, read from the cascade.
 *
 * Read here rather than inside the viewer because they are all decided in
 * docs/frontend/tokens.css, and a renderer that knows token names is a renderer that has
 * to be edited when the design system changes.
 */
function sceneStyle(element: HTMLElement): SceneStyle {
  const styles = getComputedStyle(element);
  return {
    drapeMs: readMs(styles, '--dur-drape', 380),
    morphMs: readMs(styles, '--dur-morph', 200),
    mannequinColor: styles.getPropertyValue('--mannequin').trim(),
    lightColor: styles.getPropertyValue('--studio-light-color').trim(),
    groundColor: styles.getPropertyValue('--studio-ground-color').trim(),
  };
}

export function Mannequin({ size, garments, onUnavailable }: MannequinProps): ReactNode {
  const host = useRef<HTMLDivElement>(null);
  const scene = useRef<MannequinScene | undefined>(undefined);
  /** What the figure should be wearing right now, for the scene that is still loading. */
  const latest = useRef({ size, garments });
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

    // The renderer arrives in its own chunk, so mounting is asynchronous and a buyer who
    // leaves before it lands must not leave a live WebGL context behind.
    let unmounted = false;
    void createMannequinScene({
      host: element,
      size,
      garments,
      tier,
      style: sceneStyle(element),
      // A lost context in the Instagram WebView is expected, not exceptional. Fall back
      // to the photographs rather than leaving a blank canvas (spec 11.2).
      onContextLost: () => {
        setFailed(true);
        onUnavailable();
      },
    }).then(
      (created) => {
        if (unmounted) {
          created.dispose();
          return;
        }
        scene.current = created;
        // Props may have moved while the chunk was in flight, and the opening state was
        // captured when the request went out.
        created.dress(latest.current.garments, latest.current.size);
      },
      () => {
        setFailed(true);
        onUnavailable();
      },
    );

    return () => {
      unmounted = true;
      const created = scene.current;
      scene.current = undefined;
      created?.dispose();
    };
    // The scene is built once and driven through the handle afterwards. Rebuilding it
    // when a prop changes would tear down the WebGL context on a size tap, which is the
    // opposite of the free size change ADR-0003 exists to deliver. The props read here
    // are only the opening state; every later change arrives through `dress`.
  }, []);

  useEffect(() => {
    latest.current = { size, garments };
    scene.current?.dress(garments, size);
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
            scene.current?.setView('front');
          }}
        >
          أمام
        </button>
        <button
          type="button"
          onClick={() => {
            scene.current?.setView('side');
          }}
        >
          جانب
        </button>
        <button
          type="button"
          onClick={() => {
            scene.current?.setView('back');
          }}
        >
          خلف
        </button>
        <button
          type="button"
          onClick={() => {
            scene.current?.rotate(-Math.PI / 6);
          }}
          aria-label="تدوير المانيكان إلى اليسار"
        >
          ↶
        </button>
        <button
          type="button"
          onClick={() => {
            scene.current?.recenter();
          }}
        >
          إعادة العرض
        </button>
        <button
          type="button"
          onClick={() => {
            scene.current?.rotate(Math.PI / 6);
          }}
          aria-label="تدوير المانيكان إلى اليمين"
        >
          ↷
        </button>
      </div>
    </>
  );
}
