import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { promisify } from 'node:util';
import { format } from 'prettier';

const execFileAsync = promisify(execFile);
const catalogFile = new URL('./demo-catalog.json', import.meta.url);
const imageDirectory = new URL(
  '../../apps/storefront/public/catalog/products/',
  import.meta.url,
);

interface StoreSource {
  readonly slug: string;
  readonly merchant: string;
  readonly origin: string;
}

interface ShopifyOption {
  readonly name: string;
  readonly position: number;
  readonly values: readonly string[];
}

interface ShopifyVariant {
  readonly available: boolean;
  readonly price: string;
  readonly compare_at_price: string | null;
  readonly option1: string | null;
  readonly option2: string | null;
  readonly option3: string | null;
}

interface ShopifyImage {
  readonly src: string;
  readonly width: number;
  readonly height: number;
  readonly alt: string | null;
}

interface ShopifyProduct {
  readonly handle: string;
  readonly title: string;
  readonly body_html: string | null;
  readonly updated_at: string;
  readonly options: readonly ShopifyOption[];
  readonly variants: readonly ShopifyVariant[];
  readonly images: readonly ShopifyImage[];
}

interface ShopifyFeed {
  readonly products: readonly ShopifyProduct[];
}

interface LegacyProduct {
  readonly source?: { readonly productUrl?: string };
  readonly sizeChart?: unknown;
}

type BodySize = 'XS' | 'S' | 'M' | 'L' | 'XL' | 'XXL';

const stores: readonly StoreSource[] = [
  {
    slug: 'farid',
    merchant: 'Farid Store',
    origin: 'https://faridstore.site',
  },
  {
    slug: 'clother',
    merchant: 'Clother Wear',
    origin: 'https://clother-wear.com',
  },
];

const COLOR_HEX: Readonly<Record<string, string>> = {
  black: '#17181a',
  blue: '#315b86',
  'baby blue': '#9bc2d8',
  'light blue': '#8eb9d2',
  'navy blue': '#1f344d',
  navy: '#202d48',
  burgandy: '#672338',
  burgundy: '#672338',
  maroon: '#682c37',
  brown: '#684a38',
  coffee: '#6b5140',
  camel: '#a67c52',
  latte: '#b99b7b',
  beige: '#c7b79e',
  'light beige': '#d8cbb7',
  'dark beige': '#aa9477',
  gray: '#777b7d',
  grey: '#777b7d',
  'light gray': '#b5b8b7',
  'light grey': '#b5b8b7',
  'dark gray': '#4d5151',
  'dark grey': '#4d5151',
  green: '#48624d',
  'dark green': '#294838',
  olive: '#626246',
  'dark olive': '#414a37',
  khaki: '#837a58',
  mint: '#9ebfac',
  turquoise: '#338f91',
  pink: '#c98f9a',
  red: '#a43232',
  'off-white': '#eee9de',
  white: '#f3f1e9',
  raw: '#d9cfbb',
  'washed black': '#343536',
  'vintage green': '#657361',
  striped: '#596575',
  'striped green': '#617060',
  'striped gray': '#777b7d',
  'butter yellow': '#d9bd65',
};

function moneyToCents(value: string): number {
  return Math.round(Number.parseFloat(value) * 100);
}

function stripHtml(value: string | null | undefined): string {
  return (value ?? '')
    .replace(/<img\b[^>]*>/giu, ' ')
    .replace(/<br\s*\/?\s*>/giu, '\n')
    .replace(/<\/p>/giu, '\n')
    .replace(/<[^>]+>/gu, ' ')
    .replace(/&nbsp;/gu, ' ')
    .replace(/&amp;/gu, '&')
    .replace(/\s*\n\s*/gu, '\n')
    .replace(/[ \t]{2,}/gu, ' ')
    .trim();
}

function option(product: ShopifyProduct, pattern: RegExp): ShopifyOption | undefined {
  return product.options.find((candidate) => pattern.test(candidate.name));
}

function variantOption(
  product: ShopifyProduct,
  variant: ShopifyVariant,
  pattern: RegExp,
): string | null | undefined {
  const found = product.options.find((candidate) => pattern.test(candidate.name));
  if (!found) return undefined;
  if (found.position === 1) return variant.option1;
  if (found.position === 2) return variant.option2;
  return variant.option3;
}

function canonicalSize(value: string): readonly BodySize[] {
  const normalized = value.trim().toUpperCase().replaceAll(' ', '');
  const direct: Readonly<Record<string, readonly BodySize[]>> = {
    XS: ['XS'],
    S: ['S'],
    M: ['M'],
    L: ['L'],
    XL: ['XL'],
    XXL: ['XXL'],
    '2XL': ['XXL'],
    'M/L': ['M', 'L'],
    'XL/XXL': ['XL', 'XXL'],
    'S/M': ['S', 'M'],
    28: ['S'],
    30: ['S', 'M'],
    32: ['M'],
    34: ['L'],
    36: ['XL'],
  };
  return direct[normalized] ?? [];
}

function productShape(title: string): {
  readonly slot: 'top' | 'bottom' | 'outer';
  readonly blockId: string;
} {
  const normalized = title.toLowerCase();
  if (/jorts|\bshort\b/u.test(normalized)) {
    return { slot: 'bottom', blockId: 'shorts-relaxed' };
  }
  if (/pants|denim|jean/u.test(normalized)) {
    return {
      slot: 'bottom',
      blockId: /denim|jean/u.test(normalized) ? 'jeans-straight' : 'pants-wide-leg',
    };
  }
  if (/jacket/u.test(normalized)) {
    return { slot: 'outer', blockId: 'abaya-open' };
  }
  if (/hoodie/u.test(normalized)) {
    return { slot: 'outer', blockId: 'tee-long-relaxed' };
  }
  if (/shirt|turtleneck|long sleeve/u.test(normalized)) {
    return { slot: 'top', blockId: 'tee-long-relaxed' };
  }
  return { slot: 'top', blockId: 'tee-crew-relaxed' };
}

function primaryColor(product: ShopifyProduct): {
  readonly colorLabel?: string;
  readonly colorHex: string;
} {
  const colorOption = option(product, /colou?r/iu);
  const titleColor = product.title.match(/\(([^)]+)\)\s*$/u)?.[1];
  const label =
    (titleColor && COLOR_HEX[titleColor.toLowerCase()] ? titleColor : undefined) ??
    colorOption?.values[0];
  return {
    ...(label ? { colorLabel: label } : {}),
    colorHex: label ? (COLOR_HEX[label.toLowerCase()] ?? '#595a58') : '#595a58',
  };
}

function oldCharts(products: readonly LegacyProduct[]): ReadonlyMap<string, unknown> {
  const result = new Map<string, unknown>();
  for (const product of products) {
    if (product.source?.productUrl && product.sizeChart) {
      result.set(product.source.productUrl, product.sizeChart);
    }
  }
  return result;
}

function localImageName(
  store: StoreSource,
  product: ShopifyProduct,
  remoteUrl: string,
): string {
  const digest = createHash('sha256').update(remoteUrl).digest('hex').slice(0, 12);
  return `${store.slug}-${product.handle}-${digest}.jpg`;
}

async function fetchJson(url: string): Promise<ShopifyFeed> {
  const response = await fetch(url, { headers: { 'user-agent': 'Talla catalog sync' } });
  if (!response.ok) throw new Error(`${String(response.status)} while fetching ${url}`);
  return response.json() as Promise<ShopifyFeed>;
}

async function downloadPrimary(
  store: StoreSource,
  product: ShopifyProduct,
  image: ShopifyImage,
): Promise<{
  readonly image: string;
  readonly imageWidth: number;
  readonly imageHeight: number;
}> {
  const filename = localImageName(store, product, image.src);
  const output = new URL(filename, imageDirectory);
  const temporaryDirectory = await mkdtemp(join(tmpdir(), 'talla-catalog-'));
  const input = join(temporaryDirectory, basename(new URL(image.src).pathname));
  const temporaryOutput = join(temporaryDirectory, filename);
  try {
    const response = await fetch(image.src, {
      headers: { 'user-agent': 'Talla catalog sync' },
    });
    if (!response.ok) {
      throw new Error(`${String(response.status)} while fetching ${image.src}`);
    }
    await writeFile(input, Buffer.from(await response.arrayBuffer()));
    await execFileAsync('sips', [
      '-Z',
      '720',
      '-s',
      'format',
      'jpeg',
      '-s',
      'formatOptions',
      '68',
      input,
      '--out',
      temporaryOutput,
    ]);
    await rename(temporaryOutput, output);
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
  const scale = Math.min(1, 720 / Math.max(image.width, image.height));
  return {
    image: `/catalog/products/${filename}`,
    imageWidth: Math.max(1, Math.round(image.width * scale)),
    imageHeight: Math.max(1, Math.round(image.height * scale)),
  };
}

async function buildProduct(store: StoreSource, product: ShopifyProduct, chart: unknown) {
  const availableVariants = product.variants.filter((variant) => variant.available);
  const priceSource = availableVariants[0] ?? product.variants[0];
  const sizeOption = option(product, /size|siza/iu);
  const availableSizeValues = new Set(
    availableVariants
      .map((variant) => variantOption(product, variant, /size|siza/iu))
      .filter((value): value is string => typeof value === 'string'),
  );
  const sourceSizes = (sizeOption?.values ?? []).filter((value) =>
    availableSizeValues.has(value),
  );
  const allSourceSizes = sizeOption?.values ?? [];
  const sizes = [...new Set(sourceSizes.flatMap(canonicalSize))];
  const colorOption = option(product, /colou?r/iu);
  const primary = product.images[0];
  if (!primary || !priceSource)
    throw new Error(`Product ${product.handle} has no image or price`);
  const local = await downloadPrimary(store, product, primary);
  const compareAt = availableVariants
    .map((variant) => variant.compare_at_price)
    .filter((value): value is string => typeof value === 'string')
    .map(moneyToCents)
    .filter((value) => value > moneyToCents(priceSource.price));

  return {
    key: `${store.slug}-${product.handle}`,
    name: product.title,
    nameEn: product.title,
    ...productShape(product.title),
    price: moneyToCents(priceSource.price),
    ...(compareAt.length > 0 ? { compareAtPrice: Math.min(...compareAt) } : {}),
    ...primaryColor(product),
    colors: colorOption?.values ?? [],
    sourceSizes,
    allSourceSizes,
    description: stripHtml(product.body_html),
    source: {
      merchant: store.merchant,
      productUrl: `${store.origin}/products/${product.handle}`,
      updatedAt: product.updated_at,
    },
    ...(chart ? { sizeChart: chart } : {}),
    ...local,
    images: product.images.map((image, index) => ({
      url: image.src,
      width: image.width,
      height: image.height,
      alt: image.alt || `${product.title} — ${String(index + 1)}`,
    })),
    sizes,
  };
}

let previous: { readonly products: readonly LegacyProduct[] } = { products: [] };
try {
  previous = JSON.parse(await readFile(catalogFile, 'utf8')) as {
    readonly products: readonly LegacyProduct[];
  };
} catch {
  // A first sync has no snapshot to preserve charts from.
}
const charts = oldCharts(previous.products);
await mkdir(imageDirectory, { recursive: true });

const products: Awaited<ReturnType<typeof buildProduct>>[] = [];
for (const store of stores) {
  const feed = await fetchJson(`${store.origin}/products.json?limit=250`);
  for (const product of feed.products) {
    const productUrl = `${store.origin}/products/${product.handle}`;
    products.push(await buildProduct(store, product, charts.get(productUrl)));
    process.stdout.write(`Synced ${store.merchant}: ${product.title}\n`);
  }
}

await writeFile(
  catalogFile,
  await format(
    JSON.stringify({
      generatedAt: new Date().toISOString(),
      sources: stores.map((store) => ({ merchant: store.merchant, url: store.origin })),
      products,
    }),
    { parser: 'json', printWidth: 90 },
  ),
);

process.stdout.write(`Wrote ${String(products.length)} exact product records.\n`);
