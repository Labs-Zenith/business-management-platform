"use client";

/**
 * Actual Catálogo create/edit form implementation. Always imported indirectly
 * through `./catalog-product-form.tsx` (`dynamic(..., {ssr:false})`) — never
 * import this file directly from a page, mirroring
 * `invoices/invoice-form-content.tsx`'s established split-wrapper pattern.
 *
 * PROGRESSIVE DISCLOSURE: this catalog now serves every kind of business,
 * and for most of them a product is just a name and a price — so only
 * Nombre / Precio / Categoría / Descripción are visible up front. "Precio"
 * here IS the `fixed` mode's `fixedUnitPrice` field, rendered outside the
 * disclosure only while `pricingMode === "fixed"` (the create-mode default).
 * Everything a print-shop-style business needs — the "Modo de precio"
 * `<Select>`, "Cantidad mínima de pedido" (defaults to `"1"` per
 * `defaultCatalogProductFormValues` and is rarely worth touching for a plain
 * service), and every mode-specific field group — sits behind the "Precio
 * avanzado" `Collapsible` below (`components/ui/collapsible.tsx`, a Base UI
 * wrapper). `catalog-variant-fields.tsx` owns the `variants` `useFieldArray`
 * inside that panel (and, for `tiered`, the nested per-variant `tiers`
 * array).
 *
 * The disclosure opens CLOSED on create (nobody needs it for a simple
 * service) and OPEN by default when editing a product whose `pricingMode` is
 * already something other than `fixed`, so an existing
 * variant/package/tiered/area product's configuration is never hidden from
 * whoever opens it to edit — see `pricingDetailsOpen`'s initializer below.
 *
 * Money convention matches `invoice-form-content.tsx` exactly: every price is
 * entered in whole COP pesos and converted to integer cents
 * (`pesosToCents`) only at submit time, via `buildPayload` below.
 *
 * Edit mode (passing the optional `product` prop) pre-fills every field
 * (cents -> whole pesos) and switches submission from
 * `POST /api/catalog-products` to `PATCH /api/catalog-products/{id}`, per
 * `lib/schemas/catalog-product.ts`'s `catalogProductUpdateSchema` "full
 * replacement" branch — which is why an edit's payload also includes
 * `active`, matching that schema's optional field.
 */

import { zodResolver } from "@hookform/resolvers/zod";
import { ChevronDown } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleTrigger, CollapsiblePanel } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MoneyInput, QuantityInput } from "@/components/ui/money-input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { pesosToCents } from "@/lib/money";
import type { PricingMode } from "@/lib/services/ports";
import { CatalogVariantFields } from "./catalog-variant-fields";
import { PRICING_MODE_LABELS } from "./pricing-mode-badge";
import {
  catalogProductFormSchema,
  defaultCatalogProductFormValues,
  defaultVariant,
  PRICING_MODE_VALUES,
  type CatalogProductFormValues,
} from "./catalog-product-form-schema";

const CREATE_ERROR_MESSAGE = "No se pudo crear el producto. Verifica los datos e intenta de nuevo.";
const EDIT_ERROR_MESSAGE = "No se pudo guardar los cambios. Verifica los datos e intenta de nuevo.";

/** Minimal shape this form needs for a `tiered` variant's ladder pre-fill — a subset of `CatalogPriceTier` (`lib/services/ports.ts`). */
export type CatalogProductFormContentTier = {
  quantity: number;
  unitPrice: number | null;
  flatTotalPrice: number | null;
};

/** Minimal shape this form needs to pre-fill a variant — a subset of `CatalogProductVariantWithTiers`. */
export type CatalogProductFormContentVariant = {
  name: string;
  description: string | null;
  unitPrice: number | null;
  packageQuantity: number | null;
  packageTotalPrice: number | null;
  tiers: CatalogProductFormContentTier[];
};

/** Minimal shape this form needs to pre-fill edit mode — a subset of `CatalogProductDetail`. */
export type CatalogProductFormContentProduct = {
  id: string;
  name: string;
  category: string | null;
  description: string | null;
  pricingMode: PricingMode;
  minOrderQuantity: number;
  fixedUnitPrice: number | null;
  areaBasePrice: number | null;
  areaRatePerM2: number | null;
  areaMinPrice: number | null;
  active: boolean;
  variants: CatalogProductFormContentVariant[];
};

export type CatalogProductFormContentProps = {
  /** Existing category values for this business — offered as `<datalist>` suggestions on the free-text "Categoría" input. */
  categories: string[];
  /** When present, the form operates in edit mode: pre-fills from this product and PATCHes instead of POSTing. */
  product?: CatalogProductFormContentProduct;
};

function centsToPesosString(cents: number | null): string {
  return cents === null ? "" : String(cents / 100);
}

function toDefaultValues(product: CatalogProductFormContentProduct | undefined): CatalogProductFormValues {
  if (!product) {
    return defaultCatalogProductFormValues();
  }
  return {
    name: product.name,
    category: product.category ?? "",
    description: product.description ?? "",
    pricingMode: product.pricingMode,
    minOrderQuantity: String(product.minOrderQuantity),
    fixedUnitPrice: centsToPesosString(product.fixedUnitPrice),
    areaBasePrice: centsToPesosString(product.areaBasePrice),
    areaRatePerM2: centsToPesosString(product.areaRatePerM2),
    areaMinPrice: centsToPesosString(product.areaMinPrice),
    active: product.active,
    variants: product.variants.map((variant) => ({
      name: variant.name,
      description: variant.description ?? "",
      unitPrice: centsToPesosString(variant.unitPrice),
      packageQuantity: variant.packageQuantity === null ? "" : String(variant.packageQuantity),
      packageTotalPrice: centsToPesosString(variant.packageTotalPrice),
      tiers: variant.tiers.map((tier) => ({
        quantity: String(tier.quantity),
        priceKind: tier.unitPrice !== null ? ("unit" as const) : ("flat" as const),
        unitPrice: centsToPesosString(tier.unitPrice),
        flatTotalPrice: centsToPesosString(tier.flatTotalPrice),
      })),
    })),
  };
}

/** "" -> field omitted from the payload entirely (the server treats absence, not `null`, as "not set" for optional fields). */
function moneyOrUndefined(raw: string): number | undefined {
  return raw.trim() === "" ? undefined : pesosToCents(Number(raw));
}

function intOrUndefined(raw: string): number | undefined {
  return raw.trim() === "" ? undefined : Number(raw);
}

function buildVariantsPayload(pricingMode: PricingMode, variants: CatalogProductFormValues["variants"]) {
  return variants.map((variant) => {
    const base = {
      name: variant.name.trim(),
      ...(variant.description.trim() ? { description: variant.description.trim() } : {}),
    };
    if (pricingMode === "variant") {
      return { ...base, unitPrice: pesosToCents(Number(variant.unitPrice) || 0) };
    }
    if (pricingMode === "package") {
      return {
        ...base,
        packageQuantity: Number(variant.packageQuantity),
        packageTotalPrice: pesosToCents(Number(variant.packageTotalPrice) || 0),
      };
    }
    // tiered
    return {
      ...base,
      tiers: variant.tiers.map((tier) => ({
        quantity: Number(tier.quantity),
        ...(tier.priceKind === "unit"
          ? { unitPrice: pesosToCents(Number(tier.unitPrice) || 0) }
          : { flatTotalPrice: pesosToCents(Number(tier.flatTotalPrice) || 0) }),
      })),
    };
  });
}

/**
 * Narrows the form's always-present fields down to exactly what
 * `catalogProductCreateSchema`/`catalogProductUpdateSchema`
 * (`lib/schemas/catalog-product.ts`) accept for the CHOSEN `pricingMode` —
 * see `catalog-product-form-schema.ts`'s doc comment for why every mode's
 * fields always exist on `values` regardless of the active mode.
 */
function buildPayload(values: CatalogProductFormValues, isEditing: boolean) {
  const base = {
    name: values.name.trim(),
    ...(values.category.trim() ? { category: values.category.trim() } : {}),
    ...(values.description.trim() ? { description: values.description.trim() } : {}),
    pricingMode: values.pricingMode,
    ...(isEditing ? { active: values.active } : {}),
  };

  switch (values.pricingMode) {
    case "fixed": {
      const minOrderQuantity = intOrUndefined(values.minOrderQuantity);
      return {
        ...base,
        fixedUnitPrice: pesosToCents(Number(values.fixedUnitPrice) || 0),
        ...(minOrderQuantity !== undefined ? { minOrderQuantity } : {}),
      };
    }
    case "area": {
      const minOrderQuantity = intOrUndefined(values.minOrderQuantity);
      const areaMinPrice = moneyOrUndefined(values.areaMinPrice);
      return {
        ...base,
        areaBasePrice: pesosToCents(Number(values.areaBasePrice) || 0),
        areaRatePerM2: pesosToCents(Number(values.areaRatePerM2) || 0),
        ...(areaMinPrice !== undefined ? { areaMinPrice } : {}),
        ...(minOrderQuantity !== undefined ? { minOrderQuantity } : {}),
      };
    }
    case "variant": {
      const minOrderQuantity = intOrUndefined(values.minOrderQuantity);
      return {
        ...base,
        variants: buildVariantsPayload(values.pricingMode, values.variants),
        ...(minOrderQuantity !== undefined ? { minOrderQuantity } : {}),
      };
    }
    case "package":
    case "tiered":
      // `minOrderQuantity` is derived server-side for these two modes (the
      // package size / lowest tier rung) and is never sent — see the
      // migration's header comment.
      return {
        ...base,
        variants: buildVariantsPayload(values.pricingMode, values.variants),
      };
  }
}

export default function CatalogProductFormContent({ categories, product }: CatalogProductFormContentProps) {
  const router = useRouter();
  const isEditing = Boolean(product);
  const [submitError, setSubmitError] = useState<string | null>(null);
  // Computed once from the initial `product` prop (this form never receives
  // a different `product` mid-life — a navigation to another product remounts
  // the page) — see this file's header comment for why: closed for a fresh
  // create, already open when editing a non-`fixed` product.
  const [pricingDetailsOpen, setPricingDetailsOpen] = useState(() => Boolean(product && product.pricingMode !== "fixed"));

  const {
    control,
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting, isValid },
  } = useForm<CatalogProductFormValues>({
    resolver: zodResolver(catalogProductFormSchema),
    defaultValues: toDefaultValues(product),
    // Live (as-you-type) validation, matching `invoice-form-content.tsx`.
    mode: "onTouched",
  });

  // `useWatch` (not `useForm()`'s returned `watch()`) — see
  // `invoice-form-content.tsx`'s identical doc-comment on the React Compiler
  // "incompatible library" bail-out that `watch()` triggers.
  const pricingMode = useWatch({ control, name: "pricingMode" });
  const variants = useWatch({ control, name: "variants" });

  // Switching INTO a variant-carrying mode with zero rows yet seeds exactly
  // one empty row, so the user lands on a usable form instead of an empty
  // list. Switching AWAY never clears rows — every mode's fields coexist on
  // each variant (see `catalog-product-form-schema.ts`'s doc comment), so
  // there is nothing unsafe left behind to clean up.
  useEffect(() => {
    if ((pricingMode === "variant" || pricingMode === "package" || pricingMode === "tiered") && variants.length === 0) {
      setValue("variants", [defaultVariant()]);
    }
  }, [pricingMode, variants.length, setValue]);

  async function onSubmit(values: CatalogProductFormValues) {
    setSubmitError(null);
    try {
      const payload = buildPayload(values, isEditing);
      const url = isEditing ? `/api/catalog-products/${product!.id}` : "/api/catalog-products";
      const method = isEditing ? "PATCH" : "POST";

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const body: { error?: { message?: string } } | null = await response.json().catch(() => null);
        setSubmitError(body?.error?.message ?? (isEditing ? EDIT_ERROR_MESSAGE : CREATE_ERROR_MESSAGE));
        return;
      }

      const body: { data: { id: string } } = await response.json();
      router.push(`/catalogo/${body.data.id}`);
      router.refresh();
    } catch {
      setSubmitError(isEditing ? EDIT_ERROR_MESSAGE : CREATE_ERROR_MESSAGE);
    }
  }

  const hasMinOrderQuantity = pricingMode === "fixed" || pricingMode === "variant" || pricingMode === "area";
  const hasVariants = pricingMode === "variant" || pricingMode === "package" || pricingMode === "tiered";

  return (
    <form className="mx-auto flex w-full max-w-2xl flex-col gap-4" noValidate onSubmit={handleSubmit(onSubmit)}>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="catalog-product-name">Nombre</Label>
        <Input id="catalog-product-name" {...register("name")} />
        {errors.name ? <p className="text-xs text-destructive">{errors.name.message}</p> : null}
      </div>

      {pricingMode === "fixed" ? (
        <div className="flex flex-col gap-1.5 sm:w-1/2">
          <Label htmlFor="catalog-product-fixed-unit-price">Precio</Label>
          <Controller
            control={control}
            name="fixedUnitPrice"
            render={({ field }) => (
              <MoneyInput
                id="catalog-product-fixed-unit-price"
                value={field.value}
                onChange={field.onChange}
                onBlur={field.onBlur}
                className="w-full"
                aria-invalid={!!errors.fixedUnitPrice}
              />
            )}
          />
          {errors.fixedUnitPrice ? <p className="text-xs text-destructive">{errors.fixedUnitPrice.message}</p> : null}
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="catalog-product-category">Categoría (opcional)</Label>
          <Input id="catalog-product-category" list="catalog-product-categories" {...register("category")} />
          <datalist id="catalog-product-categories">
            {categories.map((category) => (
              <option key={category} value={category} />
            ))}
          </datalist>
        </div>
        {isEditing ? (
          <div className="flex items-end gap-2.5 pb-1.5">
            <Controller
              control={control}
              name="active"
              render={({ field }) => (
                <Switch id="catalog-product-active" checked={field.value} onCheckedChange={field.onChange} />
              )}
            />
            <Label htmlFor="catalog-product-active">Producto activo</Label>
          </div>
        ) : null}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="catalog-product-description">Descripción (opcional)</Label>
        <Textarea id="catalog-product-description" {...register("description")} />
      </div>

      <Collapsible open={pricingDetailsOpen} onOpenChange={setPricingDetailsOpen} className="flex flex-col gap-4">
        <CollapsibleTrigger className="group flex w-fit items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground">
          <ChevronDown
            className="size-4 shrink-0 transition-transform group-data-[panel-open]:rotate-180"
            aria-hidden="true"
          />
          Precio avanzado
        </CollapsibleTrigger>
        <CollapsiblePanel>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="catalog-product-pricing-mode">Modo de precio</Label>
              <Controller
                control={control}
                name="pricingMode"
                render={({ field }) => (
                  <Select
                    items={PRICING_MODE_VALUES.map((mode) => ({ value: mode, label: PRICING_MODE_LABELS[mode] }))}
                    value={field.value}
                    onValueChange={field.onChange}
                  >
                    <SelectTrigger id="catalog-product-pricing-mode" className="h-9 w-full" onBlur={field.onBlur}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PRICING_MODE_VALUES.map((mode) => (
                        <SelectItem key={mode} value={mode}>
                          {PRICING_MODE_LABELS[mode]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>

            {pricingMode === "area" ? (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="catalog-product-area-base-price">Precio base</Label>
                  <Controller
                    control={control}
                    name="areaBasePrice"
                    render={({ field }) => (
                      <MoneyInput
                        id="catalog-product-area-base-price"
                        value={field.value}
                        onChange={field.onChange}
                        onBlur={field.onBlur}
                        className="w-full"
                        aria-invalid={!!errors.areaBasePrice}
                      />
                    )}
                  />
                  {errors.areaBasePrice ? <p className="text-xs text-destructive">{errors.areaBasePrice.message}</p> : null}
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="catalog-product-area-rate">Precio por m²</Label>
                  <Controller
                    control={control}
                    name="areaRatePerM2"
                    render={({ field }) => (
                      <MoneyInput
                        id="catalog-product-area-rate"
                        value={field.value}
                        onChange={field.onChange}
                        onBlur={field.onBlur}
                        className="w-full"
                        aria-invalid={!!errors.areaRatePerM2}
                      />
                    )}
                  />
                  {errors.areaRatePerM2 ? <p className="text-xs text-destructive">{errors.areaRatePerM2.message}</p> : null}
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="catalog-product-area-min-price">Precio mínimo (opcional)</Label>
                  <Controller
                    control={control}
                    name="areaMinPrice"
                    render={({ field }) => (
                      <MoneyInput
                        id="catalog-product-area-min-price"
                        value={field.value}
                        onChange={field.onChange}
                        onBlur={field.onBlur}
                        className="w-full"
                        aria-invalid={!!errors.areaMinPrice}
                      />
                    )}
                  />
                  {errors.areaMinPrice ? <p className="text-xs text-destructive">{errors.areaMinPrice.message}</p> : null}
                </div>
              </div>
            ) : null}

            {hasMinOrderQuantity ? (
              <div className="flex flex-col gap-1.5 sm:w-1/2">
                <Label htmlFor="catalog-product-min-order-quantity">Cantidad mínima de pedido</Label>
                <Controller
                  control={control}
                  name="minOrderQuantity"
                  render={({ field }) => (
                    <QuantityInput
                      id="catalog-product-min-order-quantity"
                      value={field.value}
                      onChange={field.onChange}
                      onBlur={field.onBlur}
                      className="w-full"
                      aria-invalid={!!errors.minOrderQuantity}
                    />
                  )}
                />
                {errors.minOrderQuantity ? (
                  <p className="text-xs text-destructive">{errors.minOrderQuantity.message}</p>
                ) : null}
              </div>
            ) : null}

            {hasVariants ? (
              <CatalogVariantFields control={control} register={register} errors={errors} pricingMode={pricingMode} />
            ) : null}
          </div>
        </CollapsiblePanel>
      </Collapsible>

      {submitError ? (
        <p role="alert" className="text-sm text-destructive">
          {submitError}
        </p>
      ) : null}

      <Button type="submit" disabled={isSubmitting || !isValid} className="w-full sm:w-fit">
        {isSubmitting ? "Guardando..." : isEditing ? "Guardar cambios" : "Crear producto"}
      </Button>
    </form>
  );
}
