import { z } from "zod";

/**
 * Client-side form validation only (UX affordance) — NOT the source of
 * truth. `lib/schemas/expense.ts`'s `.strict()` schema (server-side) is the
 * authoritative validator; this schema uses whole-COP-peso `amount` values
 * (converted to integer cents at submit time in
 * `expense-form-dialog-content.tsx`), since typing raw cents would be
 * unusable UX. Mirrors `invoice-form-schema.ts`'s pesos/cents split.
 */
export const expenseFormSchema = z.object({
  category: z.enum(["nomina", "otro"]),
  description: z.string().trim().min(1, "Descripcion requerida"),
  amount: z.number().positive("El monto debe ser mayor a 0"),
  expenseDate: z.string().trim().min(1, "Fecha requerida"),
  notes: z.string().trim().optional(),
});

export type ExpenseFormValues = z.infer<typeof expenseFormSchema>;
