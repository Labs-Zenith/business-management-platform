import { z } from "zod";
import type { PricingMode } from "@/lib/services/ports";

/**
 * Client-side form validation only (UX affordance), mirroring
 * `lib/schemas/catalog-product.ts`'s cross-field invariants but working over
 * whole-COP-peso RAW STRINGS (as produced by `MoneyInput`/`QuantityInput`)
 * rather than integer cents — the conversion to cents happens only at submit
 * time in `catalog-product-form-content.tsx`, exactly like
 * `invoice-form-schema.ts`'s `unitPrice` convention.
 *
 * Unlike the server schema, every mode's fields (`fixedUnitPrice`,
 * `area*`, per-variant `unitPrice`/`package*`/`tiers`) always exist on the
 * form's values — nothing is added/removed when `pricingMode` changes. This
 * keeps `catalog-variant-fields.tsx` simple (it only decides which fields to
 * RENDER for the current mode) and means a user can flip between modes
 * without losing already-typed values in fields that briefly aren't visible.
 * `buildCatalogProductPayload` (in `catalog-product-form-content.tsx`) is what
 * actually narrows the payload down to the fields the chosen `pricingMode`
 * accepts before it ever reaches the server.
 */

export const PRICING_MODE_VALUES: PricingMode[] = ["fixed", "variant", "package", "tiered", "area"];

const NAME_MAX = 200;
const CATEGORY_MAX = 100;
const DESCRIPTION_MAX = 1000;

/** A whole-peso `MoneyInput` raw string that must be present and non-negative. */
const requiredMoneyField = z
  .string()
  .trim()
  .refine((value) => value !== "", "Requerido")
  .refine((value) => Number(value) >= 0, "No puede ser negativo");

/** A whole-peso `MoneyInput` raw string that may be left blank ("" = not set). */
const optionalMoneyField = z
  .string()
  .trim()
  .refine((value) => value === "" || Number(value) >= 0, "No puede ser negativo");

/** A `QuantityInput` raw string that must be a positive integer. */
const requiredPositiveIntField = z
  .string()
  .trim()
  .refine((value) => value !== "", "Requerido")
  .refine((value) => Number.isInteger(Number(value)) && Number(value) > 0, "Debe ser un entero mayor a 0");

/** A `QuantityInput` raw string that may be blank, but must be a positive integer when present. */
const optionalPositiveIntField = z
  .string()
  .trim()
  .refine((value) => value === "" || (Number.isInteger(Number(value)) && Number(value) > 0), "Debe ser un entero mayor a 0");

export const catalogTierFormSchema = z
  .object({
    quantity: requiredPositiveIntField,
    /** Which of the two mutually-exclusive price fields below is active — mirrors `catalog_price_tiers_price_mode_chk`. */
    priceKind: z.enum(["unit", "flat"]),
    unitPrice: z.string().trim(),
    flatTotalPrice: z.string().trim(),
  })
  .superRefine((tier, ctx) => {
    if (tier.priceKind === "unit") {
      if (tier.unitPrice === "" || Number(tier.unitPrice) < 0) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Requerido", path: ["unitPrice"] });
      }
    } else if (tier.flatTotalPrice === "" || Number(tier.flatTotalPrice) < 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Requerido", path: ["flatTotalPrice"] });
    }
  });

export type CatalogTierFormValues = z.infer<typeof catalogTierFormSchema>;

export const catalogVariantFormSchema = z.object({
  name: z.string().trim().min(1, "Nombre requerido").max(NAME_MAX),
  description: z.string().trim().max(DESCRIPTION_MAX),
  /** `variant` mode only. */
  unitPrice: z.string().trim(),
  /** `package` mode only. */
  packageQuantity: z.string().trim(),
  /** `package` mode only. */
  packageTotalPrice: z.string().trim(),
  /** `tiered` mode only. */
  tiers: z.array(catalogTierFormSchema),
});

export type CatalogVariantFormValues = z.infer<typeof catalogVariantFormSchema>;

function defaultVariant(): CatalogVariantFormValues {
  return { name: "", description: "", unitPrice: "", packageQuantity: "", packageTotalPrice: "", tiers: [] };
}

function defaultTier(): CatalogTierFormValues {
  return { quantity: "", priceKind: "unit", unitPrice: "", flatTotalPrice: "" };
}

export const catalogProductFormSchema = z
  .object({
    name: z.string().trim().min(1, "Nombre requerido").max(NAME_MAX),
    category: z.string().trim().max(CATEGORY_MAX),
    description: z.string().trim().max(DESCRIPTION_MAX),
    pricingMode: z.enum(["fixed", "variant", "package", "tiered", "area"]),
    /** Honoured only for `fixed`/`variant`/`area` — see this file's doc comment and the migration's rationale. */
    minOrderQuantity: optionalPositiveIntField,
    fixedUnitPrice: z.string().trim(),
    areaBasePrice: z.string().trim(),
    areaRatePerM2: z.string().trim(),
    areaMinPrice: z.string().trim(),
    variants: z.array(catalogVariantFormSchema),
    /** Edit mode only — ignored by `buildCatalogProductPayload` on create. */
    active: z.boolean(),
  })
  .superRefine((data, ctx) => {
    switch (data.pricingMode) {
      case "fixed": {
        const result = requiredMoneyField.safeParse(data.fixedUnitPrice);
        if (!result.success) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Requerido", path: ["fixedUnitPrice"] });
        }
        return;
      }
      case "area": {
        if (!requiredMoneyField.safeParse(data.areaBasePrice).success) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Requerido", path: ["areaBasePrice"] });
        }
        if (!requiredMoneyField.safeParse(data.areaRatePerM2).success) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Requerido", path: ["areaRatePerM2"] });
        }
        if (!optionalMoneyField.safeParse(data.areaMinPrice).success) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: "No puede ser negativo", path: ["areaMinPrice"] });
        }
        return;
      }
      case "variant":
      case "package":
      case "tiered": {
        if (data.variants.length === 0) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Agrega al menos una variante",
            path: ["variants"],
          });
          return;
        }
        data.variants.forEach((variant, index) => {
          const path: (string | number)[] = ["variants", index];
          if (data.pricingMode === "variant") {
            if (!requiredMoneyField.safeParse(variant.unitPrice).success) {
              ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Requerido", path: [...path, "unitPrice"] });
            }
          } else if (data.pricingMode === "package") {
            if (!requiredPositiveIntField.safeParse(variant.packageQuantity).success) {
              ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: "Requerido",
                path: [...path, "packageQuantity"],
              });
            }
            if (!requiredMoneyField.safeParse(variant.packageTotalPrice).success) {
              ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: "Requerido",
                path: [...path, "packageTotalPrice"],
              });
            }
          } else {
            // tiered
            if (variant.tiers.length === 0) {
              ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: "Agrega al menos un escalón",
                path: [...path, "tiers"],
              });
              return;
            }
            const seenQuantities = new Set<string>();
            variant.tiers.forEach((tier, tierIndex) => {
              if (tier.quantity !== "" && seenQuantities.has(tier.quantity)) {
                ctx.addIssue({
                  code: z.ZodIssueCode.custom,
                  message: `Cantidad ${tier.quantity} duplicada en esta variante`,
                  path: [...path, "tiers", tierIndex, "quantity"],
                });
              }
              seenQuantities.add(tier.quantity);
            });
          }
        });
      }
    }
  });

export type CatalogProductFormValues = z.infer<typeof catalogProductFormSchema>;

/** Fresh, empty create-mode default values — `pricingMode` starts on `fixed`, the simplest/most common case. */
export function defaultCatalogProductFormValues(): CatalogProductFormValues {
  return {
    name: "",
    category: "",
    description: "",
    pricingMode: "fixed",
    minOrderQuantity: "1",
    fixedUnitPrice: "",
    areaBasePrice: "",
    areaRatePerM2: "",
    areaMinPrice: "",
    variants: [],
    active: true,
  };
}

export { defaultVariant, defaultTier };
