import "@/lib/zod-locale";
/**
 * Employee input schemas, per
 * `openspec/changes/nomina-payroll/specs/payroll-management/spec.md`'s
 * "Employees Are Business-Scoped and Editable" requirement.
 *
 * `.strict()` — any unknown field (including `business_id`/`id`/timestamps)
 * is rejected outright, matching `lib/schemas/customer.ts`'s convention.
 * `active` is intentionally NOT part of `employeeCreateSchema` — a new
 * employee is always active by construction (`lib/{mock,db}/employee-repo.ts`
 * hardcodes `active: true` on create); `active` only becomes editable via
 * `employeeUpdateSchema` (PATCH), mirroring `isActive` on Customer.
 * `baseSalary` is an integer minor unit (COP cents), matching `Expense.amount`.
 */

import { z } from "zod";
import { MAX_AMOUNT_COP_CENTS } from "./shared";

const NAME_MAX = 200;

const baseSalarySchema = z.number().int().positive().max(MAX_AMOUNT_COP_CENTS);

export const employeeCreateSchema = z
  .object({
    name: z.string().trim().min(1).max(NAME_MAX),
    baseSalary: baseSalarySchema,
  })
  .strict();

export type EmployeeCreateInput = z.infer<typeof employeeCreateSchema>;

export const employeeUpdateSchema = z
  .object({
    name: z.string().trim().min(1).max(NAME_MAX).optional(),
    baseSalary: baseSalarySchema.optional(),
    active: z.boolean().optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: "Update payload must include at least one field.",
  });

export type EmployeeUpdateInput = z.infer<typeof employeeUpdateSchema>;
