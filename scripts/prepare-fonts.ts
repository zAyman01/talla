import { readFile, writeFile } from 'node:fs/promises';
import subsetFont from 'subset-font';

/**
 * Subset the licensed TrueType sources and write them as WOFF2.
 *
 * The two Arabic faces are 530 KB of TrueType between them, and every byte of it is on
 * the critical path of a page whose largest contentful paint the performance gate holds
 * to 2.5 s on a 1.5 Mbps profile. Two thirds of that weight is coverage this storefront
 * never draws: Latin Extended, Cyrillic, Greek, and the mathematical alphanumerics.
 *
 * So each face is cut to the characters the product actually renders, then compressed
 * with WOFF2, which is Brotli plus a font aware transform. The pair ends up at roughly a
 * tenth of where it started, for output that is pixel identical in the range that is
 * kept.
 *
 * The TrueType files stay in the tree. They are the licensed originals, the OFL notices
 * sit beside them, and a build output committed without its source is a file nobody can
 * regenerate.
 *
 *   node scripts/prepare-fonts.ts
 *
 * Run when a font is added or replaced, or when the character set below changes. The
 * result is committed, the same way `scripts/prepare-references.ts` commits its canonical
 * images.
 */

/**
 * What the subset has to cover.
 *
 * Arabic, in all four positional forms plus the presentation blocks a shaper reaches for;
 * Arabic-Indic and European digits, because prices and sizes appear in both; Latin, for
 * the size labels, the wordmark's English half, and any brand name a store types in; and
 * the handful of marks the copy uses.
 *
 * Cut deliberately wide rather than to the strings that exist today. A store's own
 * garment names are typed by the store, and a missing glyph in a product name is a box on
 * a buyer's screen that nobody at Talla would ever see.
 */
function coverage(): string {
  const ranges: ReadonlyArray<readonly [number, number]> = [
    [0x0020, 0x007e], // Basic Latin: sizes, the English wordmark, punctuation.
    [0x00a0, 0x00ff], // Latin-1 Supplement, for the odd accented brand name.
    [0x0600, 0x06ff], // Arabic.
    [0x0750, 0x077f], // Arabic Supplement.
    [0x08a0, 0x08ff], // Arabic Extended-A.
    [0xfb50, 0xfdff], // Arabic Presentation Forms-A.
    [0xfe70, 0xfeff], // Arabic Presentation Forms-B.
    [0x200c, 0x200f], // Zero width joiners and the direction marks. RTL needs these.
    [0x2010, 0x2027], // Dashes and quotation marks.
    [0x20a0, 0x20bf], // Currency signs.
  ];
  let text = '';
  for (const [first, last] of ranges) {
    for (let code = first; code <= last; code += 1) text += String.fromCodePoint(code);
  }
  return text;
}

const FONTS = [
  'apps/storefront/fonts/IBMPlexSansArabic-Regular',
  'apps/storefront/fonts/NotoNaskhArabic',
  'apps/admin/fonts/IBMPlexSansArabic-Regular',
] as const;

const text = coverage();

for (const base of FONTS) {
  const source = await readFile(`${base}.ttf`);
  const converted = await subsetFont(source, text, { targetFormat: 'woff2' });
  await writeFile(`${base}.woff2`, converted);
  const saved = Math.round((1 - converted.byteLength / source.byteLength) * 100);
  process.stdout.write(
    `${base.split('/').pop() ?? base}: ${String(Math.round(source.byteLength / 1024))} KB TTF -> ` +
      `${String(Math.round(converted.byteLength / 1024))} KB WOFF2 (${String(saved)}% smaller)\n`,
  );
}
