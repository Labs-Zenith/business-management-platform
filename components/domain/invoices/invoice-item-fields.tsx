"use client";

import { Plus } from "lucide-react";
import {
  Controller,
  useFieldArray,
  useWatch,
  type Control,
  type FieldErrors,
  type UseFormRegister,
  type UseFormSetValue,
} from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MoneyInput } from "@/components/ui/money-input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { OTRO_PRODUCT_VALUE, type InvoiceFormValues } from "./invoice-form-schema";

/**
 * Dynamic add/remove line items for the invoice create form, per
 * `docs/ui-ux-flow.md`'s "Crear factura" screen ("Items con descripcion,
 * cantidad y valor unitario"). Uses `react-hook-form`'s `useFieldArray`.
 *
 * Only ever rendered from `invoice-form-content.tsx`, which is itself only
 * ever reached through `invoice-form.tsx`'s `dynamic(..., {ssr:false})`
 * lazy wrapper — per the user's explicit lazy-loading requirement for the
 * heaviest interactive form piece, same split-wrapper pattern as PR4's
 * `customer-form-dialog.tsx`.
 *
 * Each line's "Descripción" free-text `<Input>` was replaced by a
 * `<Select>` (base-ui, mirroring `movement-form-dialog-content.tsx`'s
 * product-select pattern) listing active inventory products (labeled
 * "Name · stock N") plus a trailing `OTRO_PRODUCT_VALUE` ("Otro…") sentinel
 * item. Picking a real product derives that row's `description` from the
 * product's name (via `setValue`, kept hidden — never rendered as its own
 * input); picking "Otro" reveals the original free-text `description`
 * `<Input>` instead. Quantity and unit price stay directly editable in both
 * cases — this change never auto-fills price from the product's cost (see
 * the parent plan's "Notas / fuera de alcance").
 */
export type InvoiceItemFieldsProduct = { id: string; name: string; currentQuantity: number };

export type InvoiceItemFieldsProps = {
  control: Control<InvoiceFormValues>;
  register: UseFormRegister<InvoiceFormValues>;
  errors: FieldErrors<InvoiceFormValues>;
  setValue: UseFormSetValue<InvoiceFormValues>;
  /** Active inventory products only — populates the product select. */
  products: InvoiceItemFieldsProduct[];
};

type InvoiceItemRowProps = {
  index: number;
  control: Control<InvoiceFormValues>;
  register: UseFormRegister<InvoiceFormValues>;
  errors: FieldErrors<InvoiceFormValues>;
  setValue: UseFormSetValue<InvoiceFormValues>;
  products: InvoiceItemFieldsProduct[];
  onRemove: () => void;
  canRemove: boolean;
};

function InvoiceItemRow({
  index,
  control,
  register,
  errors,
  setValue,
  products,
  onRemove,
  canRemove,
}: InvoiceItemRowProps) {
  const itemErrors = errors.items?.[index];
  // Drives whether the free-text description input is shown for THIS row —
  // re-renders only this row (not the whole list) on selection change.
  const productId = useWatch({ control, name: `items.${index}.productId` as const });
  const isOtro = productId === OTRO_PRODUCT_VALUE;

  const selectItems = [
    ...products.map((product) => ({
      value: product.id,
      label: `${product.name} · stock ${product.currentQuantity}`,
    })),
    { value: OTRO_PRODUCT_VALUE, label: "Otro…" },
  ];

  return (
    <div className="grid grid-cols-1 items-end gap-2 rounded-lg border p-3 sm:grid-cols-2">
      <div className="flex flex-col gap-1.5 sm:col-span-2">
        <Label htmlFor={`items.${index}.productId`}>Producto</Label>
        <Controller
          control={control}
          name={`items.${index}.productId` as const}
          render={({ field }) => (
            <Select
              items={selectItems}
              value={field.value}
              onValueChange={(value) => {
                const nextValue = value ?? "";
                field.onChange(nextValue);
                if (nextValue === OTRO_PRODUCT_VALUE) {
                  setValue(`items.${index}.description` as const, "", { shouldValidate: true });
                } else {
                  const product = products.find((candidate) => candidate.id === nextValue);
                  setValue(`items.${index}.description` as const, product?.name ?? "", { shouldValidate: true });
                }
              }}
              onOpenChange={(nextOpen) => {
                if (!nextOpen) field.onBlur();
              }}
            >
              <SelectTrigger id={`items.${index}.productId`} className="h-9 w-full">
                <SelectValue placeholder="Selecciona un producto" />
              </SelectTrigger>
              <SelectContent>
                {selectItems.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
        {itemErrors?.productId ? <p className="text-xs text-destructive">{itemErrors.productId.message}</p> : null}
      </div>

      {isOtro ? (
        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <Label htmlFor={`items.${index}.description`}>Descripción</Label>
          <Input id={`items.${index}.description`} {...register(`items.${index}.description` as const)} />
          {itemErrors?.description ? (
            <p className="text-xs text-destructive">{itemErrors.description.message}</p>
          ) : null}
        </div>
      ) : null}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`items.${index}.quantity`}>Cantidad</Label>
        <Input
          id={`items.${index}.quantity`}
          type="number"
          step="any"
          className="w-full"
          {...register(`items.${index}.quantity` as const, { valueAsNumber: true })}
        />
        {itemErrors?.quantity ? <p className="text-xs text-destructive">{itemErrors.quantity.message}</p> : null}
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`items.${index}.unitPrice`}>Valor unitario (COP)</Label>
        <Controller
          control={control}
          name={`items.${index}.unitPrice` as const}
          render={({ field }) => (
            <MoneyInput
              id={`items.${index}.unitPrice`}
              value={field.value}
              onChange={field.onChange}
              onBlur={field.onBlur}
              className="w-full"
              aria-invalid={!!itemErrors?.unitPrice}
            />
          )}
        />
        {itemErrors?.unitPrice ? <p className="text-xs text-destructive">{itemErrors.unitPrice.message}</p> : null}
      </div>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="w-full sm:col-span-2 sm:w-auto"
        onClick={onRemove}
        disabled={!canRemove}
      >
        Quitar
      </Button>
    </div>
  );
}

export function InvoiceItemFields({ control, register, errors, setValue, products }: InvoiceItemFieldsProps) {
  const { fields, append, remove } = useFieldArray({ control, name: "items" });

  return (
    <div className="flex flex-col gap-3">
      <span className="text-sm font-medium">Items</span>
      {fields.map((field, index) => (
        <InvoiceItemRow
          key={field.id}
          index={index}
          control={control}
          register={register}
          errors={errors}
          setValue={setValue}
          products={products}
          onRemove={() => remove(index)}
          canRemove={fields.length > 1}
        />
      ))}
      {errors.items?.message ? <p className="text-xs text-destructive">{errors.items.message}</p> : null}
      <Button
        type="button"
        variant="outline"
        className="w-full sm:w-fit"
        onClick={() => append({ productId: "", description: "", quantity: 1, unitPrice: "" })}
      >
        <Plus className="size-4" />
        Agregar item
      </Button>
    </div>
  );
}
