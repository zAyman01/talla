import type { Sql } from '@talla/database';
import type { BodySize } from '@talla/shared';
import type { GarmentBlockId } from '@talla/blocks';
import type { CatalogProduct } from '../product.ts';

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
  readonly sizes: readonly string[] | null;
}

const SIZES: readonly BodySize[] = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];
const BLOCKS: readonly GarmentBlockId[] = ['tee-crew-relaxed', 'jeans-straight'];

const SLOT_LABEL: Readonly<Record<'top' | 'bottom', string>> = {
  top: 'قطعة علوية',
  bottom: 'قطعة سفلية',
};

function field(source: unknown, name: string): unknown {
  if (typeof source !== 'object' || source === null) return undefined;
  return (source as Record<string, unknown>)[name];
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
  const blockId = field(row.spec, 'block_id');
  const slot = field(style, 'slot');
  const colors = field(style, 'dominant_colors');
  // `Array.isArray` narrows `unknown` to `any[]`, so the element needs its own type back
  // before it is read. The guard below is what actually admits it.
  const palette: readonly unknown[] = Array.isArray(colors) ? (colors as unknown[]) : [];
  const colorHex = palette[0];
  const image = field(display, 'image');
  const width = field(display, 'image_width');
  const height = field(display, 'image_height');

  if (
    typeof blockId !== 'string' ||
    !BLOCKS.includes(blockId as GarmentBlockId) ||
    (slot !== 'top' && slot !== 'bottom') ||
    typeof colorHex !== 'string' ||
    typeof image !== 'string' ||
    typeof width !== 'number' ||
    typeof height !== 'number'
  ) {
    return undefined;
  }

  return {
    id: row.id,
    blockId: blockId as GarmentBlockId,
    name: row.name_ar,
    slot,
    categoryLabel: SLOT_LABEL[slot],
    image,
    imageWidth: width,
    imageHeight: height,
    price: row.price,
    colorHex,
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
    `SELECT g.id, g.name_ar, g.price, g.spec,
            array_remove(array_agg(s.size ORDER BY s.size), NULL) AS sizes
     FROM garments g
     LEFT JOIN stock s ON s.garment_id = g.id AND s.quantity > 0
     WHERE g.status = 'ready'
     GROUP BY g.id, g.name_ar, g.price, g.spec, g.created_at
     -- The id is a tiebreak, not decoration. Two garments uploaded in one transaction
     -- share a created_at, and ordering on that alone lets the catalogue reshuffle
     -- between page loads for no reason a buyer could understand.
     ORDER BY g.created_at, g.id`,
  );

  const products: CatalogProduct[] = [];
  for (const row of rows) {
    const product = toProduct(row);
    if (product !== undefined) products.push(product);
  }
  return products;
}
