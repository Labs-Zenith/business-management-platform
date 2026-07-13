import { z } from "zod";

/**
 * Client-side form validation only (UX affordance) — NOT the source of
 * truth. `lib/schemas/invoice.ts`'s `.strict()` schema (server-side) is the
 * authoritative validator; this schema uses whole-COP-peso `unitPrice`
 * values (converted to integer cents at submit time in
 * `invoice-form-content.tsx`), since typing raw cents would be unusable UX.
 */
export const invoiceItemFormSchema = z.object({
  description: z.string().trim().min(1, "Descripcion requerida"),
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
});

export const invoiceFormSchema = z.object({
  customerId: z.string().trim().min(1, "Selecciona un cliente"),
  issueDate: z.string().trim().min(1, "Fecha de emision requerida"),
  dueDate: z.string().trim().optional(),
  notes: z.string().trim().optional(),
  items: z.array(invoiceItemFormSchema).min(1, "Agrega al menos un item"),
});

export type InvoiceFormValues = z.infer<typeof invoiceFormSchema>;
