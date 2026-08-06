import "@/lib/zod-locale";
/**
 * Catálogo (commercial price book) input schemas, per
 * `migrations/1700000016000_add_catalog_products.sql`'s header comment and
 * `lib/services/ports.ts`'s `CatalogProductCreate`/`CatalogProductUpdate`.
 *
 * `.strict()` everywhere, matching `lib/schemas/invoice.ts`/`product.ts`'s
 * established convention — any unknown field is rejected outright.
 *
 * The migration's `catalog_products_mode_fields_chk`/
 * `catalog_product_variants_fields_chk` CHECK constraints pin which COLUMNS
 * may be non-null per `pricingMode`, but two invariants they CANNOT express
 * (a CHECK may not reference a sibling table) live here instead:
 *   - a `variant`/`package`/`tiered` product must have >= 1 variant, and
 *     each variant's shape (unitPrice vs package* vs tiers) must match the
 *     PARENT product's `pricingMode` — the variant CHECK only pins that a
 *     variant is EITHER a package OR a tier-holder OR a plain-unit-price row,
 *     never which one the parent expects.
 *   - a `tiered` variant must have >= 1 `catalog_price_tiers` row, and its
 *     rung quantities must be unique (the migration's own
 *     `idx_catalog_price_tiers_variant_qty` unique index enforces this at
 *     the DB layer too, but only AFTER an insert already reached Postgres —
 *     rejecting it here first keeps a malformed create/update from ever
 *     attempting the DB round-trip).
 * `lib/services/product-catalog-service.ts`'s `validateCatalogProductPayload`
 * re-checks the same invariants server-side as defense in depth, exactly
 * like `invoice-service.ts`'s `validateItemInvariants` mirrors
 * `invoice.ts`'s `.superRefine`.
 *
 * All money fields are integer minor units (COP cents), matching
 * `lib/money.ts`'s whole-codebase convention.
 */

import { z } from "zod";
import type { PricingMode } from "@/lib/services/ports";
import { MAX_AMOUNT_COP_CENTS } from "./shared";

const NAME_MAX = 200;
const CATEGORY_MAX = 100;
const DESCRIPTION_MAX = 1000;

const moneySchema = z.number().int().nonnegative().max(MAX_AMOUNT_COP_CENTS);

const pricingModeSchema = z.enum(["fixed", "variant", "package", "tiered", "area"]);

const catalogPriceTierSchema = z
  .object({
    quantity: z.number().int().positive(),
    unitPrice: moneySchema.optional(),
    flatTotalPrice: moneySchema.optional(),
  })
  .strict()
  .superRefine((tier, ctx) => {
    // Mirrors `catalog_price_tiers_price_mode_chk`: exactly one of the two
    // prices, never both, never neither.
    const hasUnit = tier.unitPrice !== undefined;
    const hasFlat = tier.flatTotalPrice !== undefined;
    if (hasUnit === hasFlat) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Cada escalón debe tener exactamente uno de unitPrice o flatTotalPrice.",
        path: [hasUnit ? "flatTotalPrice" : "unitPrice"],
      });
    }
  });

const catalogVariantSchema = z
  .object({
    name: z.string().trim().min(1).max(NAME_MAX),
    description: z.string().trim().max(DESCRIPTION_MAX).nullable().optional(),
    sortOrder: z.number().int().nonnegative().optional(),
    unitPrice: moneySchema.optional(),
    packageQuantity: z.number().int().positive().optional(),
    packageTotalPrice: moneySchema.optional(),
    tiers: z.array(catalogPriceTierSchema).optional(),
  })
  .strict();

/**
 * Shared shape between create and (full) update — kept as a plain field map
 * rather than a `ZodObject` so it can be spread into two different `.strict()`
 * objects (create, and the "full" branch of update) without fighting
 * `.extend()`'s interaction with an already-`.strict()`/`.superRefine()`-ed
 * schema.
 */
const catalogProductBaseShape = {
  name: z.string().trim().min(1).max(NAME_MAX),
  category: z.string().trim().min(1).max(CATEGORY_MAX).nullable().optional(),
  description: z.string().trim().max(DESCRIPTION_MAX).nullable().optional(),
  pricingMode: pricingModeSchema,
  minOrderQuantity: z.number().int().positive().optional(),
  fixedUnitPrice: moneySchema.optional(),
  areaBasePrice: moneySchema.optional(),
  areaRatePerM2: moneySchema.optional(),
  areaMinPrice: moneySchema.optional(),
  variants: z.array(catalogVariantSchema).optional(),
};

type CatalogProductModeInvariantInput = {
  pricingMode: PricingMode;
  fixedUnitPrice?: number;
  areaBasePrice?: number;
  areaRatePerM2?: number;
  areaMinPrice?: number;
  variants?: Array<{
    name: string;
    unitPrice?: number;
    packageQuantity?: number;
    packageTotalPrice?: number;
    tiers?: Array<{ quantity: number; unitPrice?: number; flatTotalPrice?: number }>;
  }>;
};

/**
 * The mode<->fields cross-field invariant described in this file's header
 * comment. Shared by `catalogProductCreateSchema` and the "full" branch of
 * `catalogProductUpdateSchema` via `.superRefine` so the two can never
 * silently drift apart.
 */
function checkCatalogProductModeInvariants(data: CatalogProductModeInvariantInput, ctx: z.RefinementCtx): void {
  const { pricingMode, fixedUnitPrice, areaBasePrice, areaRatePerM2, areaMinPrice, variants } = data;
  const issue = (message: string, path: (string | number)[]) =>
    ctx.addIssue({ code: z.ZodIssueCode.custom, message, path });

  switch (pricingMode) {
    case "fixed": {
      if (fixedUnitPrice === undefined) {
        issue("El modo 'fixed' requiere fixedUnitPrice.", ["fixedUnitPrice"]);
      }
      if (areaBasePrice !== undefined || areaRatePerM2 !== undefined || areaMinPrice !== undefined) {
        issue("El modo 'fixed' no admite campos de área.", ["areaBasePrice"]);
      }
      if (variants && variants.length > 0) {
        issue("El modo 'fixed' no admite variantes.", ["variants"]);
      }
      return;
    }

    case "area": {
      if (fixedUnitPrice !== undefined) {
        issue("El modo 'area' no admite fixedUnitPrice.", ["fixedUnitPrice"]);
      }
      if (areaBasePrice === undefined || areaRatePerM2 === undefined) {
        issue("El modo 'area' requiere areaBasePrice y areaRatePerM2.", ["areaBasePrice"]);
      }
      if (variants && variants.length > 0) {
        issue("El modo 'area' no admite variantes.", ["variants"]);
      }
      return;
    }

    case "variant":
    case "package":
    case "tiered": {
      if (fixedUnitPrice !== undefined || areaBasePrice !== undefined || areaRatePerM2 !== undefined || areaMinPrice !== undefined) {
        issue(`El modo '${pricingMode}' no admite precio fijo ni campos de área.`, ["fixedUnitPrice"]);
      }
      if (!variants || variants.length === 0) {
        issue(`El modo '${pricingMode}' requiere al menos una variante.`, ["variants"]);
        return;
      }
      variants.forEach((variant, index) => {
        const path: (string | number)[] = ["variants", index];
        if (pricingMode === "variant") {
          if (variant.unitPrice === undefined) {
            issue(`La variante "${variant.name}" requiere unitPrice.`, [...path, "unitPrice"]);
          }
          if (variant.packageQuantity !== undefined || variant.packageTotalPrice !== undefined) {
            issue(`La variante "${variant.name}" no admite campos de paquete.`, [...path, "packageQuantity"]);
          }
          if (variant.tiers && variant.tiers.length > 0) {
            issue(`La variante "${variant.name}" no admite escalones.`, [...path, "tiers"]);
          }
        } else if (pricingMode === "package") {
          if (variant.packageQuantity === undefined || variant.packageTotalPrice === undefined) {
            issue(`La variante "${variant.name}" requiere packageQuantity y packageTotalPrice.`, [...path, "packageQuantity"]);
          }
          if (variant.unitPrice !== undefined) {
            issue(`La variante "${variant.name}" no admite unitPrice.`, [...path, "unitPrice"]);
          }
          if (variant.tiers && variant.tiers.length > 0) {
            issue(`La variante "${variant.name}" no admite escalones.`, [...path, "tiers"]);
          }
        } else {
          // tiered
          if (variant.unitPrice !== undefined || variant.packageQuantity !== undefined || variant.packageTotalPrice !== undefined) {
            issue(`La variante "${variant.name}" no admite unitPrice ni campos de paquete.`, [...path, "unitPrice"]);
          }
          if (!variant.tiers || variant.tiers.length === 0) {
            issue(`La variante "${variant.name}" requiere al menos un escalón.`, [...path, "tiers"]);
          } else {
            const seen = new Set<number>();
            variant.tiers.forEach((tier, tierIndex) => {
              if (seen.has(tier.quantity)) {
                issue(
                  `Escalones duplicados en cantidad ${tier.quantity} para la variante "${variant.name}".`,
                  [...path, "tiers", tierIndex, "quantity"],
                );
              }
              seen.add(tier.quantity);
            });
          }
        }
      });
    }
  }
}

export const catalogProductCreateSchema = z
  .object(catalogProductBaseShape)
  .strict()
  .superRefine(checkCatalogProductModeInvariants);

export type CatalogProductCreateInput = z.infer<typeof catalogProductCreateSchema>;

/**
 * `PATCH /api/catalog-products/{id}` payload, per `CatalogProductUpdate`
 * (`Partial<CatalogProductCreate> & { active?: boolean }`). Two shapes are
 * accepted:
 *   - a bare `{ active }` toggle (archive/reactivate a listing without
 *     touching its pricing at all), or
 *   - a FULL replacement of the pricing configuration (same shape as create,
 *     plus an optional `active`) — required because
 *     `CatalogProductRepository.update` replaces variants/tiers WHOLESALE
 *     (delete + re-insert) on every edit, the same way
 *     `InvoiceRepository.update` replaces items wholesale; there is no
 *     partial-patch-a-single-variant operation.
 * A payload that mixes a partial pricing edit (e.g. only `fixedUnitPrice`,
 * no `pricingMode`) matches neither branch and is rejected — the mode
 * invariants below can't be checked without knowing which mode is being
 * edited.
 */
const catalogProductActiveOnlyUpdateSchema = z.object({ active: z.boolean() }).strict();

const catalogProductFullUpdateSchema = z
  .object({ ...catalogProductBaseShape, active: z.boolean().optional() })
  .strict()
  .superRefine(checkCatalogProductModeInvariants);

export const catalogProductUpdateSchema = z.union([
  catalogProductActiveOnlyUpdateSchema,
  catalogProductFullUpdateSchema,
]);

export type CatalogProductUpdateInput = z.infer<typeof catalogProductUpdateSchema>;
