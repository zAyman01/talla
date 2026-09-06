import { lightTokens, type TokenName } from './generated/tokens.ts';

export type { TokenName } from './generated/tokens.ts';
export { lightTokens, darkTokens, reducedMotionTokens } from './generated/tokens.ts';

/**
 * The CSS reference for a token, which is what a component should use. Returning
 * `var(--name)` rather than the literal value is deliberate: a component that inlines
 * the literal stops responding to the theme, and that is the failure CLAUDE.md rule 1
 * exists to prevent.
 */
export function token(name: TokenName): string {
  return `var(${name})`;
}

/** The literal light-theme value. For canvas and WebGL, which cannot read CSS. */
export function lightValue(name: TokenName): string {
  return lightTokens[name];
}
