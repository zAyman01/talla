/**
 * Generated file. Do not edit.
 *
 * Source: docs/frontend/tokens.css
 * Regenerate: pnpm --filter @talla/tokens generate
 *
 * A raw color, size, duration, radius, or easing value in a component is a bug
 * (CLAUDE.md rule 1). Anything missing is added to tokens.css, not inlined here.
 */

export type TokenName =
  | '--paper'
  | '--surface'
  | '--surface-sunken'
  | '--stage'
  | '--line'
  | '--line-strong'
  | '--ink'
  | '--ink-muted'
  | '--ink-faint'
  | '--ink-inverse'
  | '--accent'
  | '--accent-press'
  | '--accent-weak'
  | '--on-accent'
  | '--success'
  | '--danger'
  | '--warning'
  | '--on-status'
  | '--scrim'
  | '--shadow-sm'
  | '--shadow-md'
  | '--shadow-lg'
  | '--font-display'
  | '--font-ui'
  | '--font-numeric'
  | '--text-2xs'
  | '--text-xs'
  | '--text-sm'
  | '--text-md'
  | '--text-lg'
  | '--text-xl'
  | '--text-2xl'
  | '--text-3xl'
  | '--leading-ar'
  | '--leading-latin'
  | '--leading-display'
  | '--weight-body'
  | '--weight-label'
  | '--weight-heading'
  | '--space-1'
  | '--space-2'
  | '--space-3'
  | '--space-4'
  | '--space-6'
  | '--space-8'
  | '--space-12'
  | '--space-16'
  | '--space-24'
  | '--radius-none'
  | '--radius-sm'
  | '--radius-md'
  | '--radius-lg'
  | '--radius-full'
  | '--viewer-height'
  | '--viewer-min-height'
  | '--viewer-mobile-height'
  | '--studio-light-color'
  | '--studio-ground-color'
  | '--mannequin'
  | '--content-max'
  | '--tap-min'
  | '--focus-width'
  | '--focus-offset'
  | '--z-base'
  | '--z-sticky'
  | '--z-header'
  | '--z-overlay'
  | '--z-modal'
  | '--z-toast'
  | '--dur-press'
  | '--dur-fast'
  | '--dur-enter'
  | '--dur-exit'
  | '--dur-sheet'
  | '--dur-drape'
  | '--dur-morph'
  | '--ease-enter'
  | '--ease-exit'
  | '--ease-move'
  | '--stagger-grid';

/** Light is the default. Dark is a designed palette, not an inversion. */
export const lightTokens: Readonly<Record<TokenName, string>> = Object.freeze({
  '--paper': "#fafaf9",
  '--surface': "#ffffff",
  '--surface-sunken': "#f4f4f3",
  '--stage': "#e7e7e5",
  '--line': "#d9d9d7",
  '--line-strong': "#bfbfbc",
  '--ink': "#16181a",
  '--ink-muted': "#6e7276",
  '--ink-faint': "#9a9ea1",
  '--ink-inverse': "#fafaf9",
  '--accent': "#26356b",
  '--accent-press': "#1b274f",
  '--accent-weak': "#eceef5",
  '--on-accent': "#ffffff",
  '--success': "#2f6b4f",
  '--danger': "#9b2c2c",
  '--warning': "#8a6114",
  '--on-status': "#ffffff",
  '--scrim': "rgb(22 24 26 / 0.5)",
  '--shadow-sm': "0 1px 2px rgb(22 24 26 / 0.06)",
  '--shadow-md': "0 4px 12px rgb(22 24 26 / 0.08)",
  '--shadow-lg': "0 12px 32px rgb(22 24 26 / 0.12)",
  '--font-display': "\"Noto Naskh Arabic\", \"Noto Naskh Arabic Fallback\", Georgia, serif",
  '--font-ui': "\"IBM Plex Sans Arabic\", \"IBM Plex Sans\", \"IBM Plex Sans Fallback\", system-ui, sans-serif",
  '--font-numeric': "\"IBM Plex Sans\", system-ui, sans-serif",
  '--text-2xs': "0.75rem",
  '--text-xs': "0.875rem",
  '--text-sm': "1rem",
  '--text-md': "1.1875rem",
  '--text-lg': "1.4375rem",
  '--text-xl': "1.75rem",
  '--text-2xl': "2.0625rem",
  '--text-3xl': "2.5rem",
  '--leading-ar': "1.7",
  '--leading-latin': "1.55",
  '--leading-display': "1.25",
  '--weight-body': "400",
  '--weight-label': "500",
  '--weight-heading': "600",
  '--space-1': "0.25rem",
  '--space-2': "0.5rem",
  '--space-3': "0.75rem",
  '--space-4': "1rem",
  '--space-6': "1.5rem",
  '--space-8': "2rem",
  '--space-12': "3rem",
  '--space-16': "4rem",
  '--space-24': "6rem",
  '--radius-none': "0",
  '--radius-sm': "6px",
  '--radius-md': "12px",
  '--radius-lg': "20px",
  '--radius-full': "9999px",
  '--viewer-height': "36rem",
  '--viewer-min-height': "24rem",
  '--viewer-mobile-height': "25rem",
  '--studio-light-color': "#ffffff",
  '--studio-ground-color': "#777777",
  '--mannequin': "#111214",
  '--content-max': "1200px",
  '--tap-min': "44px",
  '--focus-width': "2px",
  '--focus-offset': "2px",
  '--z-base': "0",
  '--z-sticky': "10",
  '--z-header': "20",
  '--z-overlay': "40",
  '--z-modal': "50",
  '--z-toast': "60",
  '--dur-press': "90ms",
  '--dur-fast': "160ms",
  '--dur-enter': "240ms",
  '--dur-exit': "160ms",
  '--dur-sheet': "320ms",
  '--dur-drape': "380ms",
  '--dur-morph': "200ms",
  '--ease-enter': "cubic-bezier(0.16, 1, 0.30, 1)",
  '--ease-exit': "cubic-bezier(0.40, 0, 1, 1)",
  '--ease-move': "cubic-bezier(0.65, 0, 0.35, 1)",
  '--stagger-grid': "40ms",
}) as Readonly<Record<TokenName, string>>;

/** Only the tokens the dark theme redefines. Everything else inherits. */
export const darkTokens: Readonly<Partial<Record<TokenName, string>>> = Object.freeze({
  '--paper': "#17181a",
  '--surface': "#1f2124",
  '--surface-sunken': "#131416",
  '--stage': "#2b2c2e",
  '--mannequin': "#111214",
  '--line': "#313336",
  '--line-strong': "#45484c",
  '--ink': "#f0f0ef",
  '--ink-muted': "#a3a7ab",
  '--ink-faint': "#6e7276",
  '--ink-inverse': "#16181a",
  '--accent': "#8b9bd4",
  '--accent-press': "#a5b2de",
  '--accent-weak': "#23283a",
  '--on-accent': "#12141c",
  '--success': "#6fae90",
  '--danger': "#e08585",
  '--warning': "#d3ac5f",
  '--on-status': "#12141c",
  '--scrim': "rgb(0 0 0 / 0.6)",
  '--shadow-sm': "0 1px 2px rgb(0 0 0 / 0.4)",
  '--shadow-md': "0 4px 12px rgb(0 0 0 / 0.45)",
  '--shadow-lg': "0 12px 32px rgb(0 0 0 / 0.55)",
});

/** Movement is removed under reduced motion. Information never is. */
export const reducedMotionTokens: Readonly<Partial<Record<TokenName, string>>> = Object.freeze({
  '--dur-press': "0ms",
  '--dur-fast': "60ms",
  '--dur-enter': "60ms",
  '--dur-exit': "60ms",
  '--dur-sheet': "60ms",
  '--dur-drape': "0ms",
  '--dur-morph': "0ms",
  '--stagger-grid': "0ms",
});
