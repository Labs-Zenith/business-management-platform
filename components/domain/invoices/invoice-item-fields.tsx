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
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatCOP } from "@/lib/money";
import {
  isCatalogOptionValue,
  OTRO_PRODUCT_VALUE,
  toCatalogOptionValue,
  type InvoiceFormValues,
} from "./invoice-form-schema";

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
 *
 * STOCK AFFORDANCE (`enforceStock`): the server already refuses an over-draw
 * atomically (`lib/db/invoice-repo.ts`'s floor-at-zero guard rejects the
 * whole invoice with "Stock insuficiente"), but doing so only at submit means
 * the user fills the entire form before finding out. When `enforceStock` is
 * set, out-of-stock products are shown as "sin stock" and cannot be picked,
 * and a line whose quantity exceeds what's available is flagged inline. The
 * check sums the quantity of EVERY line pointing at the same product, since
 * two lines of one product accumulate against the same balance server-side.
 *
 * It applies ONLY when creating a SALE — it is deliberately OFF in two cases:
 *
 *   - EDIT mode: the invoice being edited has already moved its own stock, so
 *     `currentQuantity` is net of it. The server reverses those movements
 *     before re-applying the new lines, meaning a line that looks like an
 *     over-draw here is perfectly valid there.
 *   - CREDIT NOTES: a return ADDS units, so it can never over-draw — and an
 *     out-of-stock product is precisely the one being returned. Disabling it
 *     would make the common case impossible to record.
 *
 * Both exclusions are decided by the caller (`invoice-form-content.tsx`). The
 * server stays the authority in every mode.
 */
export type InvoiceItemFieldsProduct = { id: string; name: string; currentQuantity: number };

/**
 * A sellable listing from the commercial catalog — mostly SERVICES, which is
 * why it has no stock at all. `unitPrice` is integer COP cents, or `null`
 * when the product prices by variant/package/tier/measurement and therefore
 * has no single figure to offer (see `pricing_mode` in
 * `migrations/1700000016000_add_catalog_products.sql`).
 */
export type InvoiceItemFieldsCatalogProduct = { id: string; name: string; unitPrice: number | null };

export type InvoiceItemFieldsProps = {
  control: Control<InvoiceFormValues>;
  register: UseFormRegister<InvoiceFormValues>;
  errors: FieldErrors<InvoiceFormValues>;
  setValue: UseFormSetValue<InvoiceFormValues>;
  /** Active inventory products only — populates the product select. */
  products: InvoiceItemFieldsProduct[];
  /** Active catalog products (services). Empty when the business has no `catalog` entitlement, which hides the group entirely. */
  catalogProducts?: InvoiceItemFieldsCatalogProduct[];
  /** Set only when creating a SALE — see the stock-affordance note in this file's doc comment. */
  enforceStock?: boolean;
};

type InvoiceItemRowProps = {
  index: number;
  control: Control<InvoiceFormValues>;
  register: UseFormRegister<InvoiceFormValues>;
  errors: FieldErrors<InvoiceFormValues>;
  setValue: UseFormSetValue<InvoiceFormValues>;
  products: InvoiceItemFieldsProduct[];
  catalogProducts: InvoiceItemFieldsCatalogProduct[];
  enforceStock: boolean;
  /** Total quantity this row's product is claiming across ALL rows, or null when stock isn't enforced. */
  claimedForProduct: number | null;
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
  catalogProducts,
  enforceStock,
  claimedForProduct,
  onRemove,
  canRemove,
}: InvoiceItemRowProps) {
  const itemErrors = errors.items?.[index];
  // Drives whether the free-text description input is shown for THIS row —
  // re-renders only this row (not the whole list) on selection change.
  const productId = useWatch({ control, name: `items.${index}.productId` as const });
  const isOtro = productId === OTRO_PRODUCT_VALUE;

  const selectedProduct = products.find((product) => product.id === productId);
  const overdrawn =
    enforceStock &&
    selectedProduct !== undefined &&
    claimedForProduct !== null &&
    claimedForProduct > selectedProduct.currentQuantity;

  const inventoryItems = products.map((product) => ({
    value: product.id,
    label:
      enforceStock && product.currentQuantity <= 0
        ? `${product.name} · sin stock`
        : `${product.name} · stock ${product.currentQuantity}`,
    // Never disable the CURRENTLY selected option: base-ui would otherwise
    // render an unselectable value, and in practice this only happens when
    // stock ran out in another tab after the pick.
    disabled: enforceStock && product.currentQuantity <= 0 && product.id !== productId,
  }));

  // Catalog products carry a price instead of a stock figure — that IS the
  // difference between the two groups, so the label shows it. No stock
  // affordance applies: a service cannot run out.
  const catalogItems = catalogProducts.map((product) => ({
    value: toCatalogOptionValue(product.id),
    label: product.unitPrice !== null ? `${product.name} · ${formatCOP(product.unitPrice)}` : product.name,
    disabled: false,
  }));

  const otroItem = { value: OTRO_PRODUCT_VALUE, label: "Otro…", disabled: false };
  // Flat list for base-ui's `items` prop (it needs every selectable value up
  // front, groups or not); the grouped rendering happens in `SelectContent`.
  const selectItems = [...inventoryItems, ...catalogItems, otroItem];

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
                  return;
                }
                if (isCatalogOptionValue(nextValue)) {
                  const catalogProduct = catalogProducts.find(
                    (candidate) => toCatalogOptionValue(candidate.id) === nextValue,
                  );
                  setValue(`items.${index}.description` as const, catalogProduct?.name ?? "", {
                    shouldValidate: true,
                  });
                  // Auto-fill the price, which inventory deliberately does NOT
                  // do: a catalog product stores a SALE price, whereas a
                  // product's `unitCost` is what it cost to acquire. Only a
                  // single-price product has a figure to offer; the rest leave
                  // it to be typed. Cents -> whole pesos, matching this form's
                  // "entered in pesos" convention.
                  if (catalogProduct?.unitPrice != null) {
                    setValue(`items.${index}.unitPrice` as const, String(catalogProduct.unitPrice / 100), {
                      shouldValidate: true,
                    });
                  }
                  return;
                }
                const product = products.find((candidate) => candidate.id === nextValue);
                setValue(`items.${index}.description` as const, product?.name ?? "", { shouldValidate: true });
              }}
              onOpenChange={(nextOpen) => {
                if (!nextOpen) field.onBlur();
              }}
            >
              <SelectTrigger id={`items.${index}.productId`} className="h-9 w-full">
                <SelectValue placeholder="Selecciona un producto" />
              </SelectTrigger>
              <SelectContent>
                {/* Grouped only when there IS a catalog to group against —
                    a business without the entitlement sees exactly the flat
                    list it saw before. */}
                {catalogItems.length > 0 ? (
                  <>
                    <SelectGroup>
                      <SelectLabel>Inventario</SelectLabel>
                      {inventoryItems.map((item) => (
                        <SelectItem key={item.value} value={item.value} disabled={item.disabled}>
                          {item.label}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                    <SelectGroup>
                      <SelectLabel>Catálogo</SelectLabel>
                      {catalogItems.map((item) => (
                        <SelectItem key={item.value} value={item.value}>
                          {item.label}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                    <SelectItem value={otroItem.value}>{otroItem.label}</SelectItem>
                  </>
                ) : (
                  selectItems.map((item) => (
                    <SelectItem key={item.value} value={item.value} disabled={item.disabled}>
                      {item.label}
                    </SelectItem>
                  ))
                )}
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
        {itemErrors?.quantity ? (
          <p className="text-xs text-destructive">{itemErrors.quantity.message}</p>
        ) : overdrawn ? (
          <p role="alert" className="text-xs text-destructive">
            Solo hay {selectedProduct!.currentQuantity} en stock
          </p>
        ) : null}
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

export function InvoiceItemFields({
  control,
  register,
  errors,
  setValue,
  products,
  catalogProducts = [],
  enforceStock = false,
}: InvoiceItemFieldsProps) {
  const { fields, append, remove } = useFieldArray({ control, name: "items" });

  // Watched at the LIST level (not per row) because the claim is per PRODUCT,
  // not per line: two rows selling the same product draw from one balance, and
  // the server sees their combined total. Only subscribed when stock is
  // actually enforced, so edit mode keeps the previous render behavior.
  const watchedItems = useWatch({ control, name: "items", disabled: !enforceStock });
  const claimedByProduct = new Map<string, number>();
  if (enforceStock && Array.isArray(watchedItems)) {
    for (const item of watchedItems) {
      const id = item?.productId;
      // Catalog lines are excluded here as well as "Otro": they claim no
      // stock, so counting them against a balance would be meaningless.
      if (!id || id === OTRO_PRODUCT_VALUE || isCatalogOptionValue(id)) continue;
      const quantity = Number(item?.quantity);
      if (!Number.isFinite(quantity) || quantity <= 0) continue;
      claimedByProduct.set(id, (claimedByProduct.get(id) ?? 0) + quantity);
    }
  }

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
          catalogProducts={catalogProducts}
          enforceStock={enforceStock}
          claimedForProduct={
            enforceStock
              ? (claimedByProduct.get(
                  (Array.isArray(watchedItems) ? watchedItems[index]?.productId : undefined) ?? "",
                ) ?? null)
              : null
          }
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
