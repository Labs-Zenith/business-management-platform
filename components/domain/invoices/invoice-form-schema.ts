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
  unitPrice: z.number().nonnegative("No puede ser negativo"),
});

export const invoiceFormSchema = z.object({
  customerId: z.string().trim().min(1, "Selecciona un cliente"),
  issueDate: z.string().trim().min(1, "Fecha de emision requerida"),
  dueDate: z.string().trim().optional(),
  notes: z.string().trim().optional(),
  items: z.array(invoiceItemFormSchema).min(1, "Agrega al menos un item"),
});

export type InvoiceFormValues = z.infer<typeof invoiceFormSchema>;
