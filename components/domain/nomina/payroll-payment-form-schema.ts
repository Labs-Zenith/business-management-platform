import { z } from "zod";

/**
 * Client-side form validation only (UX affordance) — NOT the source of
 * truth. `lib/schemas/payroll-payment.ts`'s `.strict()` schema (server-side)
 * is the authoritative validator; this schema uses a whole-COP-peso `amount`
 * value (converted to integer cents at submit time in
 * `payroll-payment-form-dialog-content.tsx`), since typing raw cents would be
 * unusable UX. Mirrors `expense-form-schema.ts`'s pesos/cents split.
 *
 * `referenceDate` and `paymentDate` are plain date strings here (no
 * `.refine(Date.parse)` — the native `<input type="date">` already
 * constrains the shape); `referenceDate` additionally drives the client-side
 * live period-preview via `lib/services/payroll-period.ts`'s `computePeriod`.
 */
export const payrollPaymentFormSchema = z.object({
  employeeId: z.string().trim().min(1, "Empleado requerido"),
  // Whole-COP-peso `amount` as a RAW string from `MoneyInput` ("" when
  // empty) — `.refine` checks `!== ""` explicitly rather than `Number(v) ||
  // 0`, since `Number("") || 0 === 0` is indistinguishable from a real "0"
  // entry (see `money-input.tsx`'s contract decision).
  amount: z
    .string()
    .trim()
    .refine((value) => value !== "" && Number(value) > 0, "El monto debe ser mayor a 0"),
  periodType: z.enum(["quincenal", "mensual"]),
  referenceDate: z.string().trim().min(1, "Fecha de referencia requerida"),
  paymentDate: z.string().trim().min(1, "Fecha de pago requerida"),
  notes: z.string().trim().optional(),
});

export type PayrollPaymentFormValues = z.infer<typeof payrollPaymentFormSchema>;
