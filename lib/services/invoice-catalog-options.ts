import { isCatalogEnabled } from "@/lib/services/features";
import { listCatalogProducts } from "@/lib/services/product-catalog-service";
import type { Session } from "@/lib/services/ports";

/**
 * The catalog half of an invoice line's product picker.
 *
 * An invoice can bill from two independent sources: `products` (inventory —
 * physical goods, stock-tracked) and `catalog_products` (the price book —
 * mostly SERVICES, no stock at all). This resolves the second one for the
 * create/edit invoice pages, so both stay identical and neither has to know
 * the entitlement rule.
 *
 * The invoice pages themselves are NOT feature-gated — every business can
 * invoice. So when a business lacks the `catalog` entitlement this returns an
 * empty list, and the picker simply renders the flat inventory list it always
 * did, with no "Catálogo" group at all.
 */

/** Same bound as the invoice page's inventory lookup — a price book is a bounded, business-owned list, not a paginated collection. */
const CATALOG_LOOKUP_PAGE_SIZE = 200;

export type InvoiceCatalogOption = {
  id: string;
  name: string;
  /**
   * Integer COP cents, or `null` when the product has no single price to
   * offer because it prices by variant, package, tier or measurement (see
   * `pricing_mode` in `migrations/1700000016000_add_catalog_products.sql`).
   * The picker auto-fills the line's price only when this is set; otherwise
   * the user types it.
   */
  unitPrice: number | null;
};

export async function listInvoiceCatalogOptions(session: Session): Promise<InvoiceCatalogOption[]> {
  if (!(await isCatalogEnabled(session.businessId))) {
    return [];
  }

  const result = await listCatalogProducts(session, { page: 1, pageSize: CATALOG_LOOKUP_PAGE_SIZE });

  return result.data
    // An inactive listing must never be offered for a NEW line, mirroring the
    // inventory side's `activeProducts` filter.
    .filter((product) => product.active)
    .map((product) => ({
      id: product.id,
      name: product.name,
      // Only `fixed` carries its price on the product row itself; every other
      // mode keeps it in variants/tiers, where there is no single figure.
      unitPrice: product.pricingMode === "fixed" ? product.fixedUnitPrice : null,
    }));
}
