"use client";

import { useFieldArray, type Control, type FieldErrors, type UseFormRegister } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { InvoiceFormValues } from "./invoice-form-schema";

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
 */
export type InvoiceItemFieldsProps = {
  control: Control<InvoiceFormValues>;
  register: UseFormRegister<InvoiceFormValues>;
  errors: FieldErrors<InvoiceFormValues>;
};

export function InvoiceItemFields({ control, register, errors }: InvoiceItemFieldsProps) {
  const { fields, append, remove } = useFieldArray({ control, name: "items" });

  return (
    <div className="flex flex-col gap-3">
      <span className="text-sm font-medium">Items</span>
      {fields.map((field, index) => {
        const itemErrors = errors.items?.[index];
        return (
          <div
            key={field.id}
            className="grid grid-cols-1 items-end gap-2 rounded-lg border p-3 sm:grid-cols-[1fr_auto_auto_auto]"
          >
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`items.${index}.description`}>Descripcion</Label>
              <Input id={`items.${index}.description`} {...register(`items.${index}.description` as const)} />
              {itemErrors?.description ? (
                <p className="text-xs text-destructive">{itemErrors.description.message}</p>
              ) : null}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`items.${index}.quantity`}>Cantidad</Label>
              <Input
                id={`items.${index}.quantity`}
                type="number"
                step="any"
                className="w-24"
                {...register(`items.${index}.quantity` as const, { valueAsNumber: true })}
              />
              {itemErrors?.quantity ? <p className="text-xs text-destructive">{itemErrors.quantity.message}</p> : null}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`items.${index}.unitPrice`}>Valor unitario (COP)</Label>
              <Input
                id={`items.${index}.unitPrice`}
                type="number"
                step="any"
                className="w-32"
                {...register(`items.${index}.unitPrice` as const, { valueAsNumber: true })}
              />
              {itemErrors?.unitPrice ? (
                <p className="text-xs text-destructive">{itemErrors.unitPrice.message}</p>
              ) : null}
            </div>
            <Button type="button" variant="ghost" size="sm" onClick={() => remove(index)} disabled={fields.length === 1}>
              Quitar
            </Button>
          </div>
        );
      })}
      {errors.items?.message ? <p className="text-xs text-destructive">{errors.items.message}</p> : null}
      <Button
        type="button"
        variant="outline"
        onClick={() => append({ description: "", quantity: 1, unitPrice: 0 })}
      >
        Agregar item
      </Button>
    </div>
  );
}
