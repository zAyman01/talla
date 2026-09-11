import type { BodySize, Slot } from '@talla/shared';
import type { GarmentBlockId } from '@talla/blocks';

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
  /** Only sizes with stock on hand. A size a buyer cannot have is not offered. */
  readonly sizes: readonly BodySize[];
}
