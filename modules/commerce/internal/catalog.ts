import type { Database } from '@talla/database';

type Size = 'XS' | 'S' | 'M' | 'L' | 'XL' | 'XXL';
interface CatalogProduct {
  readonly id: string;
  readonly name: string;
  readonly price: number;
  readonly category: 'top' | 'bottom';
  readonly categoryLabel: string;
  readonly image: {
    readonly url: string;
    readonly width: number;
    readonly height: number;
  };
  readonly sizes: readonly Size[];
}

type GarmentRow = {
  readonly id: string;
  readonly name_ar: string;
  readonly price: number;
  readonly spec: unknown;
  readonly published_assets: unknown;
  readonly sizes: unknown;
};

const allowedSizes = new Set<Size>(['XS', 'S', 'M', 'L', 'XL', 'XXL']);

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function category(spec: unknown): CatalogProduct['category'] | undefined {
  const slot = record(record(spec)?.['style'])?.['slot'];
  if (slot === 'top' || slot === 'bottom') return slot;
  return undefined;
}

function image(publishedAssets: unknown): CatalogProduct['image'] | undefined {
  const value = record(record(publishedAssets)?.['catalog_image']);
  const url = value?.['url'];
  const width = value?.['width'];
  const height = value?.['height'];
  if (
    typeof url !== 'string' ||
    !url.startsWith('/') ||
    url.startsWith('//') ||
    typeof width !== 'number' ||
    !Number.isSafeInteger(width) ||
    width < 1 ||
    width > 10_000 ||
    typeof height !== 'number' ||
    !Number.isSafeInteger(height) ||
    height < 1 ||
    height > 10_000
  )
    return undefined;
  return { url, width, height };
}

/** Only complete, ready garments are visible. Invalid publish metadata fails closed. */
export async function listCatalog(
  database: Database,
  tenantId: string,
): Promise<readonly CatalogProduct[]> {
  return database.tenant(tenantId, async (sql) => {
    const rows = (
      await sql.query<GarmentRow>(
        `SELECT g.id,g.name_ar,g.price,g.spec,g.published_assets,
          COALESCE(array_agg(s.size ORDER BY array_position(ARRAY['XS','S','M','L','XL','XXL'],s.size))
            FILTER (WHERE s.quantity > 0),'{}') AS sizes
         FROM garments g
         LEFT JOIN stock s ON s.garment_id=g.id AND s.tenant_id=g.tenant_id
         WHERE g.status='ready'
         GROUP BY g.id,g.name_ar,g.price,g.spec,g.published_assets,g.created_at
         ORDER BY g.created_at,g.id`,
      )
    ).rows;

    return rows.flatMap((row) => {
      const itemCategory = category(row.spec);
      const itemImage = image(row.published_assets);
      const itemSizes = Array.isArray(row.sizes)
        ? row.sizes.filter((size): size is Size => allowedSizes.has(size as Size))
        : [];
      if (!itemCategory || !itemImage || itemSizes.length === 0) return [];
      return [
        {
          id: row.id,
          name: row.name_ar,
          price: row.price,
          category: itemCategory,
          categoryLabel: itemCategory === 'top' ? 'قطعة علوية' : 'قطعة سفلية',
          image: itemImage,
          sizes: itemSizes,
        },
      ];
    });
  });
}
