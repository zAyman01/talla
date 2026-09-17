import type { Sql } from '@talla/database';
import type { BodySize } from '@talla/shared';
import { GARMENT_BLOCKS } from '@talla/blocks';
import type { GarmentBlockId } from '@talla/blocks';
import type {
  CatalogMeasurement,
  CatalogProduct,
  CatalogSizeChart,
  CatalogSizeChartRow,
  CatalogSource,
} from '../product.ts';

/**
 * The catalogue, read from PostgreSQL.
 *
 * Until now the storefront's catalogue was a two-element array declared inside a client
 * component. Everything here comes off a row: the name and price from `garments`, the
 * sizes from `stock`, and the presentation fields from the garment's `GarmentSpec`.
 *
 * Reading the presentation fields out of `spec` rather than adding columns for them is
 * what makes this survive the solver landing. `block_id`, `style.slot` and
 * `style.dominant_colors` are real fields of the frozen contract (spec section 7), so
 * when Garment Understanding starts producing specs, this read path does not change.
 */

interface CatalogRow extends Record<string, unknown> {
  readonly id: string;
  readonly name_ar: string;
  readonly price: number;
  readonly spec: unknown;
  readonly published_assets?: unknown;
  readonly sizes: readonly string[] | null;
}

const SIZES: readonly BodySize[] = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];
const BLOCKS = new Set<string>(GARMENT_BLOCKS.map((candidate) => candidate.id));

const SLOT_LABEL: Readonly<Record<'top' | 'bottom' | 'outer', string>> = {
  top: 'قطعة علوية',
  bottom: 'قطعة سفلية',
  outer: 'عباية ومعاطف',
};

function field(source: unknown, name: string): unknown {
  if (typeof source !== 'object' || source === null) return undefined;
  return (source as Record<string, unknown>)[name];
}

function record(source: unknown): Readonly<Record<string, unknown>> | undefined {
  return typeof source === 'object' && source !== null && !Array.isArray(source)
    ? (source as Readonly<Record<string, unknown>>)
    : undefined;
}

function catalogImage(
  assets: unknown,
  legacyDisplay: unknown,
): { image: string; width: number; height: number } | undefined {
  const published = field(assets, 'catalog_image');
  const image = field(published, 'url') ?? field(legacyDisplay, 'image');
  const width = field(published, 'width') ?? field(legacyDisplay, 'image_width');
  const height = field(published, 'height') ?? field(legacyDisplay, 'image_height');
  if (
    typeof image !== 'string' ||
    !image.startsWith('/') ||
    image.startsWith('//') ||
    typeof width !== 'number' ||
    !Number.isSafeInteger(width) ||
    width < 1 ||
    typeof height !== 'number' ||
    !Number.isSafeInteger(height) ||
    height < 1
  )
    return undefined;
  return { image, width, height };
}

function source(value: unknown): CatalogSource | undefined {
  const item = record(value);
  const merchant = item?.['merchant'];
  const productUrl = item?.['product_url'];
  if (
    typeof merchant !== 'string' ||
    typeof productUrl !== 'string' ||
    !productUrl.startsWith('https://')
  )
    return undefined;
  return { merchant, productUrl };
}

function measurement(value: unknown): CatalogMeasurement | undefined {
  const item = record(value);
  const key = item?.['key'];
  const label = item?.['label'];
  const measured = item?.['value'];
  const unit = item?.['unit'];
  if (
    typeof key !== 'string' ||
    typeof label !== 'string' ||
    typeof measured !== 'string' ||
    (unit !== undefined && typeof unit !== 'string')
  )
    return undefined;
  return { key, label, value: measured, ...(unit === undefined ? {} : { unit }) };
}

function sizeChart(value: unknown): CatalogSizeChart | undefined {
  const chart = record(value);
  const rawRows = record(chart?.['rows']);
  if (!rawRows) return undefined;
  const rows: Partial<Record<BodySize, CatalogSizeChartRow>> = {};
  for (const size of SIZES) {
    const raw = record(rawRows[size]);
    const sourceLabel = raw?.['sourceLabel'];
    const rawMeasurements = raw?.['measurements'];
    if (typeof sourceLabel !== 'string' || !Array.isArray(rawMeasurements)) continue;
    const measurements = rawMeasurements.flatMap((candidate) => {
      const parsed = measurement(candidate);
      return parsed === undefined ? [] : [parsed];
    });
    if (measurements.length === 0) continue;
    rows[size] = { sourceLabel, measurements };
  }
  if (Object.keys(rows).length === 0) return undefined;
  const rawNotes = chart?.['notes'];
  const notes = Array.isArray(rawNotes)
    ? rawNotes.filter((note): note is string => typeof note === 'string')
    : [];
  const rawImage = chart?.['sourceImageUrl'];
  const sourceImageUrl =
    typeof rawImage === 'string' && rawImage.startsWith('https://')
      ? rawImage
      : undefined;
  return { rows, notes, ...(sourceImageUrl ? { sourceImageUrl } : {}) };
}

export type { CatalogProduct };

/**
 * A row becomes a product only if the spec carries everything the viewer needs.
 *
 * A garment whose spec is incomplete is skipped rather than rendered with defaults. A
 * placeholder on a storefront is worse than an absence: the store owner cannot see that
 * anything is wrong, and the buyer sees a garment that is not the one they would receive.
 */
export function toProduct(row: CatalogRow): CatalogProduct | undefined {
  const style = field(row.spec, 'style');
  const display = field(row.spec, 'display');
  const assets = row.published_assets;
  const blockId = field(row.spec, 'block_id');
  const slot = field(style, 'slot');
  const colors = field(style, 'dominant_colors');
  // `Array.isArray` narrows `unknown` to `any[]`, so the element needs its own type back
  // before it is read. The guard below is what actually admits it.
  const palette: readonly unknown[] = Array.isArray(colors) ? (colors as unknown[]) : [];
  const colorHex = field(assets, 'color_hex') ?? palette[0];
  const colorLabel = field(assets, 'color_label');
  const picture = catalogImage(assets, display);
  const itemSource = source(field(assets, 'source'));
  const chart = sizeChart(field(assets, 'size_chart'));

  if (
    typeof blockId !== 'string' ||
    !BLOCKS.has(blockId) ||
    (slot !== 'top' && slot !== 'bottom' && slot !== 'outer') ||
    typeof colorHex !== 'string' ||
    picture === undefined
  ) {
    return undefined;
  }

  return {
    id: row.id,
    blockId: blockId as GarmentBlockId,
    name: row.name_ar,
    slot,
    categoryLabel: SLOT_LABEL[slot],
    image: picture.image,
    imageWidth: picture.width,
    imageHeight: picture.height,
    price: row.price,
    colorHex,
    ...(typeof colorLabel === 'string' ? { colorLabel } : {}),
    ...(chart === undefined ? {} : { sizeChart: chart }),
    ...(itemSource === undefined ? {} : { source: itemSource }),
    sizes: SIZES.filter((size) => (row.sizes ?? []).includes(size)),
  };
}

/**
 * Everything a buyer can order from this store.
 *
 * Only `ready` garments, and only sizes with stock. The join is left outer so a garment
 * with no stock at all still appears with an empty size list, which is what lets the page
 * show it as sold out rather than silently dropping it.
 */
export async function readCatalog(sql: Sql): Promise<readonly CatalogProduct[]> {
  const { rows } = await sql.query<CatalogRow>(
    `SELECT g.id, g.name_ar, g.price, g.spec, g.published_assets,
            array_remove(array_agg(s.size ORDER BY s.size), NULL) AS sizes
     FROM garments g
     LEFT JOIN stock s ON s.garment_id = g.id AND s.quantity > 0
     WHERE g.status = 'ready'
     GROUP BY g.id, g.name_ar, g.price, g.spec, g.published_assets, g.created_at
     -- The id is a tiebreak, not decoration. Two garments uploaded in one transaction
     -- share a created_at, and ordering on that alone lets the catalogue reshuffle
     -- between page loads for no reason a buyer could understand.
     ORDER BY COALESCE((g.published_assets ->> 'sort_order')::integer, 2147483647),
              g.created_at, g.id`,
  );

  const products: CatalogProduct[] = [];
  for (const row of rows) {
    const product = toProduct(row);
    if (product !== undefined) products.push(product);
  }
  return products;
}
