/**
 * `subset-font` wraps harfbuzz compiled to WebAssembly and ships no types.
 *
 * Declared here rather than reached for with `any`, so the one call site keeps a real
 * signature and a wrong argument is still a compile error.
 */
declare module 'subset-font' {
  export default function subsetFont(
    font: Uint8Array,
    text: string,
    options?: { targetFormat?: 'sfnt' | 'woff' | 'woff2' },
  ): Promise<Uint8Array>;
}
