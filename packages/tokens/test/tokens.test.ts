import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import {
  lightTokens,
  darkTokens,
  reducedMotionTokens,
  token,
  lightValue,
} from '../src/index.ts';
import { renderTokens } from '../src/render-tokens.ts';
import { generatedTokensPath } from '../src/paths.ts';

describe('design tokens', () => {
  it('carry the palette from tokens.css', () => {
    expect(lightValue('--accent')).toBe('#26356b');
    expect(lightValue('--stage')).toBe('#e7e7e5');
    expect(lightTokens['--text-xs']).toBe('0.875rem');
  });

  it('reference the custom property rather than inlining its value', () => {
    expect(token('--accent')).toBe('var(--accent)');
  });

  it('keep the dark theme as an override set, not a second full palette', () => {
    expect(darkTokens['--accent']).toBe('#8b9bd4');
    // The viewer backdrop is never tinted in either theme, so it is redefined in dark
    // rather than inherited, and it must not have been folded into the light set.
    expect(darkTokens['--accent']).not.toBe(lightTokens['--accent']);
    expect(Object.keys(darkTokens).length).toBeLessThan(Object.keys(lightTokens).length);
  });

  it('remove movement under reduced motion without removing anything else', () => {
    expect(reducedMotionTokens['--dur-drape']).toBe('0ms');
    for (const name of Object.keys(reducedMotionTokens)) {
      expect(name.startsWith('--dur-') || name.startsWith('--stagger-')).toBe(true);
    }
  });

  it('are current with the stylesheet', async () => {
    const [committed, current] = await Promise.all([
      readFile(generatedTokensPath, 'utf8'),
      renderTokens(),
    ]);
    expect(
      committed,
      'Tokens are stale or hand-edited. Run: pnpm --filter @talla/tokens generate',
    ).toBe(current);
  });
});
