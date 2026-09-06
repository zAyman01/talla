import { readFile } from 'node:fs/promises';
import { tokensCssPath } from './paths.ts';

const BANNER = `/**
 * Generated file. Do not edit.
 *
 * Source: docs/frontend/tokens.css
 * Regenerate: pnpm --filter @talla/tokens generate
 *
 * A raw color, size, duration, radius, or easing value in a component is a bug
 * (CLAUDE.md rule 1). Anything missing is added to tokens.css, not inlined here.
 */
`;

/** Declarations of one CSS block, in source order. */
export type Declarations = Record<string, string>;

/**
 * Read the block that starts at `openBraceIndex` and return its custom-property
 * declarations. Nested blocks are skipped rather than flattened, so the dark theme's
 * `:root` inside a media query is read on its own terms.
 */
function readBlock(css: string, openBraceIndex: number): string {
  let depth = 0;
  for (let i = openBraceIndex; i < css.length; i += 1) {
    const char = css[i];
    if (char === '{') depth += 1;
    if (char === '}') {
      depth -= 1;
      if (depth === 0) return css.slice(openBraceIndex + 1, i);
    }
  }
  throw new Error(`Unbalanced braces in tokens.css at index ${String(openBraceIndex)}`);
}

const DECLARATION = /(--[a-z0-9-]+)\s*:\s*([^;]+);/gi;

function declarationsOf(block: string): Declarations {
  // Comments can contain colons and semicolons, so they go before the scan rather
  // than being worked around inside it.
  const withoutComments = block.replace(/\/\*[\s\S]*?\*\//g, '');
  const declarations: Declarations = {};
  for (const match of withoutComments.matchAll(DECLARATION)) {
    const [, name, value] = match;
    if (name !== undefined && value !== undefined) {
      declarations[name] = value.trim();
    }
  }
  return declarations;
}

function blockAfter(css: string, marker: string, fromIndex = 0): Declarations {
  const markerIndex = css.indexOf(marker, fromIndex);
  if (markerIndex === -1) throw new Error(`tokens.css no longer contains: ${marker}`);
  const braceIndex = css.indexOf('{', markerIndex);
  return declarationsOf(readBlock(css, braceIndex));
}

export interface TokenSets {
  light: Declarations;
  dark: Declarations;
  reducedMotion: Declarations;
}

/** Parse the three token sets out of the stylesheet. */
export async function readTokenSets(): Promise<TokenSets> {
  const css = await readFile(tokensCssPath, 'utf8');
  const darkMediaIndex = css.indexOf('@media (prefers-color-scheme: dark)');
  const reducedMediaIndex = css.indexOf('@media (prefers-reduced-motion: reduce)');
  return {
    light: blockAfter(css, ':root'),
    dark: blockAfter(css, ':root', darkMediaIndex),
    reducedMotion: blockAfter(css, ':root', reducedMediaIndex),
  };
}

function asObjectLiteral(declarations: Declarations): string {
  const entries = Object.entries(declarations)
    .map(([name, value]) => `  '${name}': ${JSON.stringify(value)},`)
    .join('\n');
  return `{\n${entries}\n}`;
}

/**
 * Produce the TypeScript source for the current stylesheet without writing it, so the
 * generator and the drift test share one code path.
 */
export async function renderTokens(): Promise<string> {
  const { light, dark, reducedMotion } = await readTokenSets();
  const names = Object.keys(light)
    .map((name) => `  | '${name}'`)
    .join('\n');

  return `${BANNER}
export type TokenName =
${names};

/** Light is the default. Dark is a designed palette, not an inversion. */
export const lightTokens: Readonly<Record<TokenName, string>> = Object.freeze(${asObjectLiteral(light)}) as Readonly<Record<TokenName, string>>;

/** Only the tokens the dark theme redefines. Everything else inherits. */
export const darkTokens: Readonly<Partial<Record<TokenName, string>>> = Object.freeze(${asObjectLiteral(dark)});

/** Movement is removed under reduced motion. Information never is. */
export const reducedMotionTokens: Readonly<Partial<Record<TokenName, string>>> = Object.freeze(${asObjectLiteral(reducedMotion)});
`;
}
