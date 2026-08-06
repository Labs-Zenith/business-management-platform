import { z } from "zod";

/**
 * Sentinel `productId` value meaning "no real inventory product — free-text
 * line" (`invoice-item-fields.tsx`'s "Otro…" `<SelectItem>`). Never a real
 * `products.id` (those are UUIDs), so it can never collide with a real
 * product selection. Shared between the schema (conditional `description`
 * requirement below) and the item-fields/content components' submit
 * mapping.
 */
export const OTRO_PRODUCT_VALUE = "otro";

/**
 * Marks a product `<Select>` option as coming from the commercial catalog
 * rather than from inventory.
 *
 * The row's `productId` field holds ONE string for what are now three
 * different kinds of line, and inventory and catalog ids are both UUIDs — so
 * the id alone cannot say which table it belongs to. Inventory ids stay BARE
 * (nothing about the existing behaviour changes) and only catalog ones carry
 * this prefix, which a UUID can never begin with. `parseItemSource` below is
 * the single place that turns the field back into the two nullable columns
 * the server expects.
 */
export const CATALOG_PRODUCT_PREFIX = "cat:";

/** Builds the `<Select>` option value for a catalog product. */
export function toCatalogOptionValue(catalogProductId: string): string {
  return `${CATALOG_PRODUCT_PREFIX}${catalogProductId}`;
}

/** True when this row's selection is a catalog product (a service), not an inventory SKU. */
export function isCatalogOptionValue(value: string): boolean {
  return value.startsWith(CATALOG_PRODUCT_PREFIX);
}

/**
 * Splits a row's selection into the two mutually-exclusive foreign keys an
 * invoice line carries. Only an inventory `productId` moves stock; a
 * `catalogProductId` is a reference to a sellable service and moves none.
 */
export function parseItemSource(value: string): {
  productId: string | null;
  catalogProductId: string | null;
} {
  if (value === OTRO_PRODUCT_VALUE || value === "") {
    return { productId: null, catalogProductId: null };
  }
  if (isCatalogOptionValue(value)) {
    return { productId: null, catalogProductId: value.slice(CATALOG_PRODUCT_PREFIX.length) };
  }
  return { productId: value, catalogProductId: null };
}

/**
 * Client-side form validation only (UX affordance) — NOT the source of
 * truth. `lib/schemas/invoice.ts`'s `.strict()` schema (server-side) is the
 * authoritative validator; this schema uses whole-COP-peso `unitPrice`
 * values (converted to integer cents at submit time in
 * `invoice-form-content.tsx`), since typing raw cents would be unusable UX.
 */
export const invoiceItemFormSchema = z
  .object({
    // Either a real `products.id` or the `OTRO_PRODUCT_VALUE` sentinel —
    // `min(1)` alone already rejects the pristine "" default, forcing an
    // explicit choice (real product or "Otro") before a line can be
    // submitted, matching `invoice-item-fields.tsx`'s `append` default.
    productId: z.string().trim().min(1, "Selecciona un producto"),
    // Required only when `productId === OTRO_PRODUCT_VALUE` (see the
    // `.superRefine` below) — for a real product, this is derived from the
    // product's name (`invoice-item-fields.tsx`'s `setValue` on selection),
    // so an empty value here is not itself invalid at the field level.
    description: z.string().trim(),
    // Plain `z.number()` (not `z.coerce.number()`): the corresponding inputs
    // are registered with `{ valueAsNumber: true }` in
    // `invoice-item-fields.tsx`, so react-hook-form already produces a
    // `number` before validation runs. Using `z.coerce` here would give this
    // schema a different input vs. output type, which breaks
    // `@hookform/resolvers`' `zodResolver` generic inference against
    // `useForm<InvoiceFormValues>`.
    quantity: z.number().positive("Debe ser mayor a 0"),
    // Whole-COP-peso `unitPrice` as a RAW string from `MoneyInput` ("" when
    // empty) — the first `.refine` checks `!== ""` explicitly rather than
    // `Number(v) || 0`, since `Number("") || 0 === 0` is indistinguishable from
    // a real "0" entry (see `money-input.tsx`'s contract decision). Two chained
    // refines (rather than one combined condition) so each invalid case gets
    // its own accurate message instead of both showing "No puede ser negativo".
    // Mirrors the original `nonnegative` semantics: 0 is a valid explicit
    // entry, "" is not.
    unitPrice: z
      .string()
      .trim()
      .refine((value) => value !== "", "Requerido")
      .refine((value) => Number(value) >= 0, "No puede ser negativo"),
  })
  .superRefine((item, ctx) => {
    if (item.productId === OTRO_PRODUCT_VALUE && item.description.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Descripción requerida",
        path: ["description"],
      });
    }
    // Only an INVENTORY line decrements stock, through an INTEGER
    // `inventory_movements.quantity` column (see `lib/schemas/invoice.ts`'s
    // matching server-side `.superRefine`) — reject a fractional quantity
    // inline, before submit. "Otro" free-text lines and CATALOG lines never
    // touch inventory and may stay fractional: a service is legitimately
    // billed as 1.5 hours.
    const isInventoryLine =
      item.productId !== OTRO_PRODUCT_VALUE && item.productId !== "" && !isCatalogOptionValue(item.productId);
    if (isInventoryLine && !Number.isInteger(item.quantity)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Debe ser un número entero",
        path: ["quantity"],
      });
    }
  });

export const invoiceFormSchema = z.object({
  customerId: z.string().trim().min(1, "Selecciona un cliente"),
  issueDate: z.string().trim().min(1, "Fecha de emisión requerida"),
  dueDate: z.string().trim().optional(),
  notes: z.string().trim().optional(),
  // Optional at THIS (client) validation level — required/pre-filled in
  // practice by `invoice-form-content.tsx`'s create-mode default, and unused
  // (never rendered/submitted) in edit mode, where the invoice type is
  // immutable after creation.
  invoiceTypeId: z.string().trim().optional(),
  items: z.array(invoiceItemFormSchema).min(1, "Agrega al menos un item"),
});

export type InvoiceFormValues = z.infer<typeof invoiceFormSchema>;
