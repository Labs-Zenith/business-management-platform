/**
 * Commercial catalog ("Catálogo") service, per
 * `migrations/1700000016000_add_catalog_products.sql`'s header comment and
 * `lib/services/ports.ts`'s `CatalogProductRepository`.
 *
 * Line-for-line analog of `product-service.ts`/`employee-service.ts`: every
 * function resolves `businessId` from the `Session` argument ONLY. Cross-
 * business access always surfaces as `NOT_FOUND`, never leaking whether a
 * differently-scoped listing exists.
 */

import { ApiError } from "@/lib/server/api-error";
import { repositories } from "@/lib/services/repositories";
import type {
  CatalogProductCreate,
  CatalogProductDetail,
  CatalogProductListQuery,
  CatalogProductSummary,
  CatalogProductUpdate,
  CatalogVariantCreate,
  Paged,
  PricingMode,
  Session,
} from "@/lib/services/ports";

export async function listCatalogProducts(
  session: Session,
  query: CatalogProductListQuery,
): Promise<Paged<CatalogProductSummary>> {
  return repositories.productCatalog.list(session.businessId, query);
}

export async function getCatalogProduct(session: Session, id: string): Promise<CatalogProductDetail> {
  const product = await repositories.productCatalog.getById(session.businessId, id);
  if (!product) {
    throw new ApiError("NOT_FOUND", "Catalog product not found.");
  }
  return product;
}

export async function listCatalogCategories(session: Session): Promise<string[]> {
  return repositories.productCatalog.listCategories(session.businessId);
}

/**
 * Shape shared by `CatalogProductCreate` and the "full replace" branch of
 * `CatalogProductUpdate` — the fields `validateCatalogProductPayload` needs
 * to re-check the mode<->fields cross-field invariant.
 */
type CatalogProductModeInvariantData = {
  pricingMode: PricingMode;
  fixedUnitPrice?: number;
  areaBasePrice?: number;
  areaRatePerM2?: number;
  areaMinPrice?: number;
  variants?: CatalogVariantCreate[];
};

/**
 * Defense-in-depth re-check of the mode<->fields invariant
 * `lib/schemas/catalog-product.ts`'s `.superRefine` already enforces at the
 * HTTP boundary — mirrors `invoice-service.ts`'s `validateItemInvariants`
 * mirroring `invoice.ts`'s own `.superRefine`. Throws
 * `ApiError("VALIDATION_ERROR", ...)` on the first violation found; never
 * partially validates.
 *
 * See `migrations/1700000016000_add_catalog_products.sql`'s header comment
 * for WHY this can't live purely in a DB CHECK constraint (it spans the
 * `catalog_products`/`catalog_product_variants`/`catalog_price_tiers`
 * tables).
 */
export function validateCatalogProductPayload(data: CatalogProductModeInvariantData): void {
  const fail = (message: string): never => {
    throw new ApiError("VALIDATION_ERROR", message);
  };
  const { pricingMode, fixedUnitPrice, areaBasePrice, areaRatePerM2, areaMinPrice, variants } = data;

  switch (pricingMode) {
    case "fixed": {
      if (fixedUnitPrice === undefined) fail("El modo 'fixed' requiere fixedUnitPrice.");
      if (areaBasePrice !== undefined || areaRatePerM2 !== undefined || areaMinPrice !== undefined) {
        fail("El modo 'fixed' no admite campos de área.");
      }
      if (variants && variants.length > 0) fail("El modo 'fixed' no admite variantes.");
      return;
    }

    case "area": {
      if (fixedUnitPrice !== undefined) fail("El modo 'area' no admite fixedUnitPrice.");
      if (areaBasePrice === undefined || areaRatePerM2 === undefined) {
        fail("El modo 'area' requiere areaBasePrice y areaRatePerM2.");
      }
      if (variants && variants.length > 0) fail("El modo 'area' no admite variantes.");
      return;
    }

    case "variant":
    case "package":
    case "tiered": {
      if (
        fixedUnitPrice !== undefined ||
        areaBasePrice !== undefined ||
        areaRatePerM2 !== undefined ||
        areaMinPrice !== undefined
      ) {
        fail(`El modo '${pricingMode}' no admite precio fijo ni campos de área.`);
      }
      if (!variants || variants.length === 0) {
        fail(`El modo '${pricingMode}' requiere al menos una variante.`);
      }
      for (const variant of variants!) {
        if (pricingMode === "variant") {
          if (variant.unitPrice === undefined) fail(`La variante "${variant.name}" requiere unitPrice.`);
          if (variant.packageQuantity !== undefined || variant.packageTotalPrice !== undefined) {
            fail(`La variante "${variant.name}" no admite campos de paquete.`);
          }
          if (variant.tiers && variant.tiers.length > 0) fail(`La variante "${variant.name}" no admite escalones.`);
        } else if (pricingMode === "package") {
          if (variant.packageQuantity === undefined || variant.packageTotalPrice === undefined) {
            fail(`La variante "${variant.name}" requiere packageQuantity y packageTotalPrice.`);
          }
          if (variant.unitPrice !== undefined) fail(`La variante "${variant.name}" no admite unitPrice.`);
          if (variant.tiers && variant.tiers.length > 0) fail(`La variante "${variant.name}" no admite escalones.`);
        } else {
          // tiered
          if (
            variant.unitPrice !== undefined ||
            variant.packageQuantity !== undefined ||
            variant.packageTotalPrice !== undefined
          ) {
            fail(`La variante "${variant.name}" no admite unitPrice ni campos de paquete.`);
          }
          if (!variant.tiers || variant.tiers.length === 0) {
            fail(`La variante "${variant.name}" requiere al menos un escalón.`);
          }
          const seen = new Set<number>();
          for (const tier of variant.tiers!) {
            if (seen.has(tier.quantity)) {
              fail(`Escalones duplicados en cantidad ${tier.quantity} para la variante "${variant.name}".`);
            }
            seen.add(tier.quantity);
            const hasUnit = tier.unitPrice !== undefined;
            const hasFlat = tier.flatTotalPrice !== undefined;
            if (hasUnit === hasFlat) {
              fail(`El escalón de ${tier.quantity} unds debe tener exactamente uno de unitPrice o flatTotalPrice.`);
            }
          }
        }
      }
      return;
    }
  }
}

export async function createCatalogProduct(
  session: Session,
  data: CatalogProductCreate,
): Promise<CatalogProductDetail> {
  validateCatalogProductPayload(data);
  return repositories.productCatalog.create(session.businessId, data);
}

/**
 * `data.pricingMode` present -> a FULL replacement of the pricing
 * configuration (variants/tiers replaced wholesale by the repository), so
 * the same mode invariant is re-checked here. `data.pricingMode` absent ->
 * a bare `{ active }` toggle (or any other future partial field), which has
 * no pricing invariant to check at all — see
 * `lib/schemas/catalog-product.ts`'s `catalogProductUpdateSchema` doc
 * comment for why those are the only two accepted shapes.
 */
export async function updateCatalogProduct(
  session: Session,
  id: string,
  data: CatalogProductUpdate,
): Promise<CatalogProductDetail> {
  const { pricingMode } = data;
  if (pricingMode !== undefined) {
    // Re-spread with `pricingMode` explicitly narrowed (TS does not narrow
    // `data`'s own type from a destructured property check) so the object
    // literal actually satisfies `CatalogProductModeInvariantData`'s
    // required `pricingMode`.
    validateCatalogProductPayload({ ...data, pricingMode });
  }

  const updated = await repositories.productCatalog.update(session.businessId, id, data);
  if (!updated) {
    throw new ApiError("NOT_FOUND", "Catalog product not found.");
  }
  return updated;
}

/**
 * Hard delete, refused once the listing has been invoiced — same guard, and
 * the same reasoning, as `deleteProduct`: a catalog edit must never destroy
 * billing history. The `CONFLICT` message is rendered verbatim in the confirm
 * dialog's inline alert (hence Spanish, unlike the structural `NOT_FOUND`),
 * and the dialog then offers deactivation as the way forward. Admin-only: the
 * `deleteRecords` capability is enforced at the route.
 */
export async function deleteCatalogProduct(session: Session, id: string): Promise<void> {
  const result = await repositories.productCatalog.delete(session.businessId, id);

  if (result.outcome === "not_found") {
    throw new ApiError("NOT_FOUND", "Catalog product not found.");
  }
  if (result.outcome === "conflict") {
    const n = result.invoiceCount;
    throw new ApiError(
      "CONFLICT",
      `No se puede eliminar este producto porque tiene ${n} factura${n === 1 ? "" : "s"} asociada${n === 1 ? "" : "s"}. Desactívalo en su lugar.`,
      { invoiceCount: n },
    );
  }
}
