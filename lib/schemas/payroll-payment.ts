/**
 * Payroll payment input schema, per
 * `openspec/changes/nomina-payroll/specs/payroll-management/spec.md`'s
 * "Positive Integer Amount" and "Period Type Determines Computed Period
 * Range" requirements, and `design.md`'s `PayrollPaymentInput` shape.
 *
 * `.strict()` — any unknown field (including `business_id`, `periodStart`,
 * `periodEnd`, which are ALWAYS server-derived, never client-supplied) is
 * rejected outright. `amount` is an integer minor unit (COP cents),
 * `.int()` enforcing the spec's "Non-integer amount rejected" scenario.
 * `employeeId` requires `.uuid()` so a malformed id is rejected here with a
 * clean 400 instead of surfacing as a raw Postgres cast error later.
 */

import { z } from "zod";
import { MAX_AMOUNT_COP_CENTS } from "./shared";

const NOTES_MAX = 1000;

const dateSchema = z
  .string()
  .trim()
  .min(1)
  .refine((value) => !Number.isNaN(Date.parse(value)), { message: "Invalid date." });

export const payrollPaymentCreateSchema = z
  .object({
    employeeId: z.string().trim().min(1).uuid(),
    amount: z.number().int().positive().max(MAX_AMOUNT_COP_CENTS),
    periodType: z.enum(["quincenal", "mensual"]),
    referenceDate: dateSchema,
    paymentDate: dateSchema,
    notes: z.string().trim().max(NOTES_MAX).optional(),
  })
  .strict();

export type PayrollPaymentCreateInput = z.infer<typeof payrollPaymentCreateSchema>;
