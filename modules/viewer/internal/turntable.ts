/**
 * Tier C Fallback: 36-frame drag-to-spin sprite turntable.
 *
 * For low-end devices, data-saver modes, or when WebGL context is lost (ADR-0010).
 * Provides smooth 360-degree rotation across 36 frames (10 degrees per frame)
 * using lightweight 2D canvas rasterisation, full pointer/touch drag handling,
 * and keyboard accessibility.
 */

export interface TurntableOptions {
  readonly host: HTMLElement;
  readonly frames: readonly string[];
  readonly initialFrame?: number;
  readonly label?: string;
  readonly onFrameChange?: (frameIndex: number) => void;
}

export interface TurntableInstance {
  readonly currentFrame: () => number;
  readonly setFrame: (index: number) => void;
  readonly spin: (delta: number) => void;
  readonly dispose: () => void;
}

export function createTurntable(options: TurntableOptions): TurntableInstance {
  const {
    host,
    frames,
    initialFrame = 0,
    label = 'تدوير النموذج 360 درجة',
    onFrameChange,
  } = options;
  const frameCount = Math.max(1, frames.length);
  let activeFrame = ((initialFrame % frameCount) + frameCount) % frameCount;
  let disposed = false;

  const canvas = document.createElement('canvas');
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('tabindex', '0');
  canvas.setAttribute('aria-label', `${label}: زاوية ${String(activeFrame * 10)} درجة`);
  canvas.style.touchAction = 'none';
  canvas.style.userSelect = 'none';
  canvas.style.cursor = 'grab';
  canvas.style.width = '100%';
  canvas.style.height = '100%';
  canvas.style.display = 'block';

  host.replaceChildren(canvas);
  const ctx = canvas.getContext('2d');

  const loadedImages: (HTMLImageElement | undefined)[] = Array.from({
    length: frameCount,
  });
  let isDragging = false;
  let startX = 0;
  let startFrame = 0;
  const pixelsPerFrame = 12;

  function render(): void {
    if (disposed || !ctx) return;
    const img = loadedImages[activeFrame];
    const width = canvas.width;
    const height = canvas.height;
    ctx.clearRect(0, 0, width, height);

    if (img && img.complete && img.naturalWidth > 0) {
      const aspectImg = img.naturalWidth / img.naturalHeight;
      const aspectCanvas = width / height;
      let drawW = width;
      let drawH = height;
      let drawX = 0;
      let drawY = 0;

      if (aspectCanvas > aspectImg) {
        drawW = height * aspectImg;
        drawX = (width - drawW) / 2;
      } else {
        drawH = width / aspectImg;
        drawY = (height - drawH) / 2;
      }
      ctx.drawImage(img, drawX, drawY, drawW, drawH);
    }
  }

  function resize(): void {
    const rect = host.getBoundingClientRect();
    const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
    const w = Math.max(1, Math.floor(rect.width * dpr));
    const h = Math.max(1, Math.floor(rect.height * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
      render();
    }
  }

  function loadFrame(idx: number): void {
    if (loadedImages[idx] || !frames[idx]) return;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = frames[idx] ?? '';
    img.onload = () => {
      if (disposed) return;
      if (activeFrame === idx) render();
    };
    loadedImages[idx] = img;
  }

  loadFrame(activeFrame);
  for (let i = 0; i < frameCount; i += 1) {
    loadFrame(i);
  }

  function setFrame(newIndex: number): void {
    if (disposed) return;
    const normalized = ((newIndex % frameCount) + frameCount) % frameCount;
    if (normalized === activeFrame) return;
    activeFrame = normalized;
    canvas.setAttribute('aria-label', `${label}: زاوية ${String(activeFrame * 10)} درجة`);
    onFrameChange?.(activeFrame);
    render();
  }

  function spin(delta: number): void {
    setFrame(activeFrame + delta);
  }

  function onPointerDown(e: PointerEvent): void {
    if (e.button !== 0) return;
    isDragging = true;
    startX = e.clientX;
    startFrame = activeFrame;
    canvas.style.cursor = 'grabbing';
    try {
      canvas.setPointerCapture(e.pointerId);
    } catch {
      // Pointer capture might fail in test environments
    }
  }

  function onPointerMove(e: PointerEvent): void {
    if (!isDragging) return;
    const dx = e.clientX - startX;
    const frameShift = Math.round(dx / pixelsPerFrame);
    setFrame(startFrame - frameShift);
  }

  function onPointerUp(e: PointerEvent): void {
    if (!isDragging) return;
    isDragging = false;
    canvas.style.cursor = 'grab';
    try {
      canvas.releasePointerCapture(e.pointerId);
    } catch {
      // In case pointer capture was lost
    }
  }

  function onKeyDown(e: KeyboardEvent): void {
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      spin(-1);
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      spin(1);
    } else if (e.key === 'Home') {
      e.preventDefault();
      setFrame(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      setFrame(frameCount - 1);
    }
  }

  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointercancel', onPointerUp);
  canvas.addEventListener('keydown', onKeyDown);

  const resizeObserver =
    typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(() => {
          resize();
        })
      : undefined;
  resizeObserver?.observe(host);
  resize();

  return {
    currentFrame: () => activeFrame,
    setFrame,
    spin,
    dispose: () => {
      if (disposed) return;
      disposed = true;
      resizeObserver?.disconnect();
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('pointercancel', onPointerUp);
      canvas.removeEventListener('keydown', onKeyDown);
      host.replaceChildren();
    },
  };
}
