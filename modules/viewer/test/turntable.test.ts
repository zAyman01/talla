import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTurntable } from '../internal/turntable.ts';

type Listener = (event: unknown) => void;

interface TestGlobal {
  document?: unknown;
  Image?: unknown;
  window?: unknown;
}

describe('createTurntable', () => {
  const env = globalThis as unknown as TestGlobal;
  const originalDocument = env.document;
  const originalImage = env.Image;
  const originalWindow = env.window;

  beforeEach(() => {
    const listeners = new Map<string, Listener[]>();
    const attributes = new Map<string, string>();

    const mockCanvas = {
      width: 300,
      height: 400,
      style: {} as Record<string, string>,
      setAttribute: (k: string, v: string) => {
        attributes.set(k, v);
      },
      getAttribute: (k: string) => attributes.get(k),
      getContext: () => ({
        clearRect: () => {},
        drawImage: () => {},
      }),
      addEventListener: (event: string, handler: Listener) => {
        const list = listeners.get(event) ?? [];
        list.push(handler);
        listeners.set(event, list);
      },
      removeEventListener: (event: string, handler: Listener) => {
        const list = listeners.get(event) ?? [];
        listeners.set(
          event,
          list.filter((h) => h !== handler),
        );
      },
      setPointerCapture: () => {},
      releasePointerCapture: () => {},
    };

    env.document = {
      createElement: (tag: string) => {
        if (tag === 'canvas') return mockCanvas;
        return { style: {} };
      },
    };

    env.Image = class {
      crossOrigin = '';
      src = '';
      onload: (() => void) | null = null;
      complete = true;
      naturalWidth = 300;
      naturalHeight = 400;
    };

    env.window = {
      devicePixelRatio: 2,
    };
  });

  afterEach(() => {
    env.document = originalDocument;
    env.Image = originalImage;
    env.window = originalWindow;
  });

  it('initializes with 36 frames and correct initial frame', () => {
    const frames = Array.from({ length: 36 }, (_, i) => `/frames/${String(i)}.webp`);
    const replaceChildren = vi.fn();
    const host = {
      replaceChildren,
      getBoundingClientRect: () => ({ width: 300, height: 400 }),
    } as unknown as HTMLElement;

    const turntable = createTurntable({
      host,
      frames,
      initialFrame: 0,
    });

    expect(turntable.currentFrame()).toBe(0);
    expect(replaceChildren).toHaveBeenCalled();
  });

  it('spins and wraps around 36 frames modulo 36', () => {
    const frames = Array.from({ length: 36 }, (_, i) => `/frames/${String(i)}.webp`);
    const replaceChildren = vi.fn();
    const host = {
      replaceChildren,
      getBoundingClientRect: () => ({ width: 300, height: 400 }),
    } as unknown as HTMLElement;

    let changed = -1;
    const turntable = createTurntable({
      host,
      frames,
      initialFrame: 0,
      onFrameChange: (f) => {
        changed = f;
      },
    });

    turntable.spin(5);
    expect(turntable.currentFrame()).toBe(5);
    expect(changed).toBe(5);

    // Spin backwards past 0
    turntable.spin(-10);
    expect(turntable.currentFrame()).toBe(31);
    expect(changed).toBe(31);

    // Spin full circle
    turntable.spin(36);
    expect(turntable.currentFrame()).toBe(31);

    turntable.setFrame(18);
    expect(turntable.currentFrame()).toBe(18);
    expect(changed).toBe(18);
  });

  it('disposes cleanly and cleans host element', () => {
    const frames = Array.from({ length: 36 }, (_, i) => `/frames/${String(i)}.webp`);
    const replaceChildren = vi.fn();
    const host = {
      replaceChildren,
      getBoundingClientRect: () => ({ width: 300, height: 400 }),
    } as unknown as HTMLElement;

    const turntable = createTurntable({ host, frames });
    turntable.dispose();

    expect(replaceChildren).toHaveBeenCalledTimes(2);
  });
});
