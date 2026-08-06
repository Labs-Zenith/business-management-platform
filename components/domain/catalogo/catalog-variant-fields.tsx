"use client";

import type { ReactNode } from "react";
import { Plus } from "lucide-react";
import {
  Controller,
  useFieldArray,
  useWatch,
  type Control,
  type FieldErrors,
  type UseFormRegister,
} from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MoneyInput, QuantityInput } from "@/components/ui/money-input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MoneyAmount } from "@/components/domain/money-amount";
import { lineTotal, pesosToCents } from "@/lib/money";
import type { PricingMode } from "@/lib/services/ports";
import {
  defaultTier,
  defaultVariant,
  type CatalogProductFormValues,
} from "./catalog-product-form-schema";

/**
 * The `variants` `useFieldArray` for `catalog-product-form-content.tsx`,
 * nesting a SECOND `useFieldArray` of tiers inside each `tiered`-mode
 * variant row — the "print shop entering 12/24/36/50 unds at different
 * unit prices" case this change is built around.
 *
 * Every variant row always carries all three price shapes' fields
 * (`unitPrice`, `packageQuantity`/`packageTotalPrice`, `tiers`) regardless of
 * `pricingMode` — this component only decides which of them to RENDER for
 * the current mode (see `catalog-product-form-schema.ts`'s doc comment for
 * why). Each row shows a small computed preview (reusing `formatCOP` via
 * `MoneyAmount`) so the user can see what their configuration will actually
 * charge, not just pass validation.
 */

export type CatalogVariantFieldsProps = {
  control: Control<CatalogProductFormValues>;
  register: UseFormRegister<CatalogProductFormValues>;
  errors: FieldErrors<CatalogProductFormValues>;
  /** Only these three modes carry variants — `fixed`/`area` never render this component. */
  pricingMode: Extract<PricingMode, "variant" | "package" | "tiered">;
};

type VariantRowProps = {
  index: number;
  control: Control<CatalogProductFormValues>;
  register: UseFormRegister<CatalogProductFormValues>;
  errors: FieldErrors<CatalogProductFormValues>;
  pricingMode: Extract<PricingMode, "variant" | "package" | "tiered">;
  onRemove: () => void;
  canRemove: boolean;
};

function VariantUnitPriceField({
  index,
  control,
  errors,
}: {
  index: number;
  control: Control<CatalogProductFormValues>;
  errors: FieldErrors<CatalogProductFormValues>;
}) {
  const rawUnitPrice = useWatch({ control, name: `variants.${index}.unitPrice` as const });
  const unitPriceError = errors.variants?.[index]?.unitPrice;
  const cents = pesosToCents(Number(rawUnitPrice) || 0);

  return (
    <div className="grid grid-cols-1 items-end gap-2 sm:grid-cols-2">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`variants.${index}.unitPrice`}>Precio unitario</Label>
        <Controller
          control={control}
          name={`variants.${index}.unitPrice` as const}
          render={({ field }) => (
            <MoneyInput
              id={`variants.${index}.unitPrice`}
              value={field.value}
              onChange={field.onChange}
              onBlur={field.onBlur}
              className="w-full"
              aria-invalid={!!unitPriceError}
            />
          )}
        />
        {unitPriceError ? <p className="text-xs text-destructive">{unitPriceError.message}</p> : null}
      </div>
      <p className="text-sm text-muted-foreground">
        {rawUnitPrice.trim() !== "" ? (
          <>
            Se cobrará <MoneyAmount cents={cents} /> por unidad, cantidad libre.
          </>
        ) : (
          "Ingresa un precio para ver la vista previa."
        )}
      </p>
    </div>
  );
}

function VariantPackageFields({
  index,
  control,
  errors,
}: {
  index: number;
  control: Control<CatalogProductFormValues>;
  errors: FieldErrors<CatalogProductFormValues>;
}) {
  const packageQuantity = useWatch({ control, name: `variants.${index}.packageQuantity` as const });
  const packageTotalPrice = useWatch({ control, name: `variants.${index}.packageTotalPrice` as const });
  const variantErrors = errors.variants?.[index];

  const qty = Number(packageQuantity) || 0;
  const totalCents = pesosToCents(Number(packageTotalPrice) || 0);
  const perUnitCents = qty > 0 ? Math.round(totalCents / qty) : null;

  return (
    <div className="grid grid-cols-1 items-end gap-2 sm:grid-cols-2">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`variants.${index}.packageQuantity`}>Unidades por paquete</Label>
        <Controller
          control={control}
          name={`variants.${index}.packageQuantity` as const}
          render={({ field }) => (
            <QuantityInput
              id={`variants.${index}.packageQuantity`}
              value={field.value}
              onChange={field.onChange}
              onBlur={field.onBlur}
              className="w-full"
              aria-invalid={!!variantErrors?.packageQuantity}
            />
          )}
        />
        {variantErrors?.packageQuantity ? (
          <p className="text-xs text-destructive">{variantErrors.packageQuantity.message}</p>
        ) : null}
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`variants.${index}.packageTotalPrice`}>Precio del paquete</Label>
        <Controller
          control={control}
          name={`variants.${index}.packageTotalPrice` as const}
          render={({ field }) => (
            <MoneyInput
              id={`variants.${index}.packageTotalPrice`}
              value={field.value}
              onChange={field.onChange}
              onBlur={field.onBlur}
              className="w-full"
              aria-invalid={!!variantErrors?.packageTotalPrice}
            />
          )}
        />
        {variantErrors?.packageTotalPrice ? (
          <p className="text-xs text-destructive">{variantErrors.packageTotalPrice.message}</p>
        ) : null}
      </div>
      <p className="text-sm text-muted-foreground sm:col-span-2">
        {qty > 0 && packageTotalPrice.trim() !== "" ? (
          <>
            Un paquete de {qty} unidades cuesta <MoneyAmount cents={totalCents} /> (~
            <MoneyAmount cents={perUnitCents ?? 0} /> por unidad). Solo se venden paquetes completos.
          </>
        ) : (
          "Completa la cantidad y el precio del paquete para ver la vista previa."
        )}
      </p>
    </div>
  );
}

function TierRow({
  variantIndex,
  tierIndex,
  control,
  errors,
  onRemove,
  canRemove,
}: {
  variantIndex: number;
  tierIndex: number;
  control: Control<CatalogProductFormValues>;
  errors: FieldErrors<CatalogProductFormValues>;
  onRemove: () => void;
  canRemove: boolean;
}) {
  const tierErrors = errors.variants?.[variantIndex]?.tiers?.[tierIndex];
  const priceKind = useWatch({ control, name: `variants.${variantIndex}.tiers.${tierIndex}.priceKind` as const });
  const quantity = useWatch({ control, name: `variants.${variantIndex}.tiers.${tierIndex}.quantity` as const });
  const unitPrice = useWatch({ control, name: `variants.${variantIndex}.tiers.${tierIndex}.unitPrice` as const });
  const flatTotalPrice = useWatch({
    control,
    name: `variants.${variantIndex}.tiers.${tierIndex}.flatTotalPrice` as const,
  });

  const qty = Number(quantity) || 0;
  let preview: ReactNode = "Completa la cantidad y el precio para ver la vista previa.";
  if (qty > 0 && priceKind === "unit" && unitPrice.trim() !== "") {
    const unitCents = pesosToCents(Number(unitPrice) || 0);
    preview = (
      <>
        {qty} unds a <MoneyAmount cents={unitCents} /> c/u = <MoneyAmount cents={lineTotal(qty, unitCents)} />
      </>
    );
  } else if (qty > 0 && priceKind === "flat" && flatTotalPrice.trim() !== "") {
    const flatCents = pesosToCents(Number(flatTotalPrice) || 0);
    preview = (
      <>
        {qty} unds por <MoneyAmount cents={flatCents} /> (~<MoneyAmount cents={Math.round(flatCents / qty)} /> c/u)
      </>
    );
  }

  const priceFieldId = `variants.${variantIndex}.tiers.${tierIndex}.${priceKind === "unit" ? "unitPrice" : "flatTotalPrice"}`;

  return (
    <div className="grid grid-cols-2 items-end gap-2 rounded-md border border-border p-2 sm:grid-cols-[6rem_10rem_1fr_auto]">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`variants.${variantIndex}.tiers.${tierIndex}.quantity`}>Cantidad</Label>
        <Controller
          control={control}
          name={`variants.${variantIndex}.tiers.${tierIndex}.quantity` as const}
          render={({ field }) => (
            <QuantityInput
              id={`variants.${variantIndex}.tiers.${tierIndex}.quantity`}
              value={field.value}
              onChange={field.onChange}
              onBlur={field.onBlur}
              className="w-full"
              aria-invalid={!!tierErrors?.quantity}
            />
          )}
        />
        {tierErrors?.quantity ? <p className="text-xs text-destructive">{tierErrors.quantity.message}</p> : null}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`variants.${variantIndex}.tiers.${tierIndex}.priceKind`}>Tipo de precio</Label>
        <Controller
          control={control}
          name={`variants.${variantIndex}.tiers.${tierIndex}.priceKind` as const}
          render={({ field }) => (
            <Select
              items={[
                { value: "unit", label: "Por unidad" },
                { value: "flat", label: "Total del escalón" },
              ]}
              value={field.value}
              onValueChange={field.onChange}
            >
              <SelectTrigger id={`variants.${variantIndex}.tiers.${tierIndex}.priceKind`} className="h-9 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="unit">Por unidad</SelectItem>
                <SelectItem value="flat">Total del escalón</SelectItem>
              </SelectContent>
            </Select>
          )}
        />
      </div>

      <div className="col-span-2 flex flex-col gap-1.5 sm:col-span-1">
        <Label htmlFor={priceFieldId}>{priceKind === "unit" ? "Precio por unidad" : "Precio total del escalón"}</Label>
        {priceKind === "unit" ? (
          <Controller
            control={control}
            name={`variants.${variantIndex}.tiers.${tierIndex}.unitPrice` as const}
            render={({ field }) => (
              <MoneyInput
                id={priceFieldId}
                value={field.value}
                onChange={field.onChange}
                onBlur={field.onBlur}
                className="w-full"
                aria-invalid={!!tierErrors?.unitPrice}
              />
            )}
          />
        ) : (
          <Controller
            control={control}
            name={`variants.${variantIndex}.tiers.${tierIndex}.flatTotalPrice` as const}
            render={({ field }) => (
              <MoneyInput
                id={priceFieldId}
                value={field.value}
                onChange={field.onChange}
                onBlur={field.onBlur}
                className="w-full"
                aria-invalid={!!tierErrors?.flatTotalPrice}
              />
            )}
          />
        )}
        {priceKind === "unit" && tierErrors?.unitPrice ? (
          <p className="text-xs text-destructive">{tierErrors.unitPrice.message}</p>
        ) : null}
        {priceKind === "flat" && tierErrors?.flatTotalPrice ? (
          <p className="text-xs text-destructive">{tierErrors.flatTotalPrice.message}</p>
        ) : null}
      </div>

      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="col-span-2 w-full sm:col-span-1 sm:w-auto"
        onClick={onRemove}
        disabled={!canRemove}
      >
        Quitar
      </Button>

      <p className="col-span-2 text-xs text-muted-foreground sm:col-span-4">{preview}</p>
    </div>
  );
}

function VariantTierFields({
  variantIndex,
  control,
  errors,
}: {
  variantIndex: number;
  control: Control<CatalogProductFormValues>;
  errors: FieldErrors<CatalogProductFormValues>;
}) {
  const { fields, append, remove } = useFieldArray({ control, name: `variants.${variantIndex}.tiers` as const });
  const tiersError = errors.variants?.[variantIndex]?.tiers;
  const tiersMessage = typeof tiersError?.message === "string" ? tiersError.message : undefined;

  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm font-medium">Escalones de cantidad</span>
      <div className="flex flex-col gap-2">
        {fields.map((field, tierIndex) => (
          <TierRow
            key={field.id}
            variantIndex={variantIndex}
            tierIndex={tierIndex}
            control={control}
            errors={errors}
            onRemove={() => remove(tierIndex)}
            canRemove={fields.length > 1}
          />
        ))}
      </div>
      {tiersMessage ? <p className="text-xs text-destructive">{tiersMessage}</p> : null}
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="w-full sm:w-fit"
        onClick={() => append(defaultTier())}
      >
        <Plus className="size-4" />
        Agregar escalón
      </Button>
    </div>
  );
}

function CatalogVariantRow({ index, control, register, errors, pricingMode, onRemove, canRemove }: VariantRowProps) {
  const variantErrors = errors.variants?.[index];

  return (
    <div className="flex flex-col gap-3 rounded-lg border p-3">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`variants.${index}.name`}>{pricingMode === "package" ? "Nombre del paquete" : "Nombre de la variante"}</Label>
          <Input
            id={`variants.${index}.name`}
            placeholder="Ej. Aviso en acrílico 150x55 cm"
            {...register(`variants.${index}.name` as const)}
          />
          {variantErrors?.name ? <p className="text-xs text-destructive">{variantErrors.name.message}</p> : null}
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`variants.${index}.description`}>Descripción (opcional)</Label>
          <Input id={`variants.${index}.description`} {...register(`variants.${index}.description` as const)} />
        </div>
      </div>

      {pricingMode === "variant" ? <VariantUnitPriceField index={index} control={control} errors={errors} /> : null}
      {pricingMode === "package" ? <VariantPackageFields index={index} control={control} errors={errors} /> : null}
      {pricingMode === "tiered" ? <VariantTierFields variantIndex={index} control={control} errors={errors} /> : null}

      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="w-full sm:w-fit"
        onClick={onRemove}
        disabled={!canRemove}
      >
        Quitar {pricingMode === "package" ? "paquete" : "opción"}
      </Button>
    </div>
  );
}

export function CatalogVariantFields({ control, register, errors, pricingMode }: CatalogVariantFieldsProps) {
  const { fields, append, remove } = useFieldArray({ control, name: "variants" });
  const variantsMessage = typeof errors.variants?.message === "string" ? errors.variants.message : undefined;
  const heading = pricingMode === "package" ? "Paquetes" : "Opciones";
  const addLabel = pricingMode === "package" ? "Agregar paquete" : "Agregar opción";

  return (
    <div className="flex flex-col gap-3">
      <span className="text-sm font-medium">{heading}</span>
      {fields.map((field, index) => (
        <CatalogVariantRow
          key={field.id}
          index={index}
          control={control}
          register={register}
          errors={errors}
          pricingMode={pricingMode}
          onRemove={() => remove(index)}
          canRemove={fields.length > 1}
        />
      ))}
      {variantsMessage ? <p className="text-xs text-destructive">{variantsMessage}</p> : null}
      <Button type="button" variant="outline" className="w-full sm:w-fit" onClick={() => append(defaultVariant())}>
        <Plus className="size-4" />
        {addLabel}
      </Button>
    </div>
  );
}
