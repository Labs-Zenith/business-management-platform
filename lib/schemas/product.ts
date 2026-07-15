import "@/lib/zod-locale";
/**
 * Product input schemas, per
 * `openspec/changes/inventario/specs/inventory-tracking/spec.md`'s "Products
 * Are Business-Scoped and Editable" and "SKU Is Optional Free Text"
 * requirements.
 *
 * `.strict()` — any unknown field (including `businessId`/`id`/timestamps/
 * computed `currentQuantity`/`totalValue`/`isLowStock`) is rejected outright,
 * matching `lib/schemas/employee.ts`'s convention. `active` is intentionally
 * NOT part of `productCreateSchema` — a new product is always active by
 * construction (`lib/{mock,db}/product-repo.ts` hardcodes `active: true` on
 * create); `active` only becomes editable via `productUpdateSchema` (PATCH).
 * `unitCost` is an integer minor unit (COP cents), matching
 * `Employee.baseSalary`/`Expense.amount`. `sku` has NO uniqueness
 * constraint — matches `customers.documentNumber`'s permissive convention.
 *
 * `minStockThreshold` is REMOVED (Wave 1A): low-stock is now a FIXED business
 * rule (`1 <= currentQuantity <= 3`, see `lib/services/inventory-stock.ts`),
 * not a per-product configurable value — a payload carrying it is rejected by
 * `.strict()` like any other unknown field.
 */

import { z } from "zod";
import { MAX_AMOUNT_COP_CENTS } from "./shared";

const NAME_MAX = 200;
const SKU_MAX = 100;

const unitCostSchema = z.number().int().positive().max(MAX_AMOUNT_COP_CENTS);

export const productCreateSchema = z
  .object({
    name: z.string().trim().min(1).max(NAME_MAX),
    sku: z.string().trim().min(1).max(SKU_MAX).nullable().optional(),
    unitCost: unitCostSchema,
  })
  .strict();

export type ProductCreateInput = z.infer<typeof productCreateSchema>;

export const productUpdateSchema = z
  .object({
    name: z.string().trim().min(1).max(NAME_MAX).optional(),
    sku: z.string().trim().min(1).max(SKU_MAX).nullable().optional(),
    unitCost: unitCostSchema.optional(),
    active: z.boolean().optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: "Update payload must include at least one field.",
  });

export type ProductUpdateInput = z.infer<typeof productUpdateSchema>;
