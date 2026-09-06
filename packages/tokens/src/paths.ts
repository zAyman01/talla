/**
 * `tokens.css` is documentation and build input at once (ADR-0015). It stays in docs
 * where designers read it, and one place here resolves it.
 */
export const tokensCssPath = new URL(
  '../../../docs/frontend/tokens.css',
  import.meta.url,
);

export const generatedTokensPath = new URL('./generated/tokens.ts', import.meta.url);
