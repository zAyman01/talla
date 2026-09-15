import type { BodySize, Slot } from '@talla/shared';
import type { GarmentBlockId } from '@talla/blocks';

export interface CatalogMeasurement {
  readonly key: string;
  readonly label: string;
  /** Kept as text so ranges and source anomalies are never silently changed. */
  readonly value: string;
  readonly unit?: string;
}

export interface CatalogSizeChartRow {
  /** The label printed by the merchant, such as M/S or 2XL. */
  readonly sourceLabel: string;
  readonly measurements: readonly CatalogMeasurement[];
}

export interface CatalogSizeChart {
  readonly rows: Readonly<Partial<Record<BodySize, CatalogSizeChartRow>>>;
  readonly notes: readonly string[];
  readonly sourceImageUrl?: string;
}

export interface CatalogSource {
  readonly merchant: string;
  readonly productUrl: string;
}

/**
 * One sellable garment, as the page needs it.
 *
 * This lives outside both `server/` and `components/` on purpose. The server reads it
 * from PostgreSQL and the client component renders it, and `no-client-into-server` in
 * `.dependency-cruiser.cjs` forbids the component from reaching into `server/` to find
 * the type. A shared shape at the app root is the seam that satisfies both.
 */
export interface CatalogProduct {
  readonly id: string;
  readonly blockId: GarmentBlockId;
  readonly name: string;
  readonly slot: Extract<Slot, 'top' | 'bottom'>;
  readonly categoryLabel: string;
  readonly image: string;
  readonly imageWidth: number;
  readonly imageHeight: number;
  readonly price: number;
  /**
   * Merchandise colour. Catalog data, not a design token: the garment is the only
   * saturated thing on the page, and its colour comes from the piece itself.
   */
  readonly colorHex: string;
  readonly colorLabel?: string;
  readonly sizeChart?: CatalogSizeChart;
  readonly source?: CatalogSource;
  /** Only sizes with stock on hand. A size a buyer cannot have is not offered. */
  readonly sizes: readonly BodySize[];
}
