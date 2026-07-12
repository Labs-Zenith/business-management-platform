/**
 * Expense input schema, per
 * `openspec/changes/expenses-dashboard-split/specs/expense-tracking/spec.md`
 * and `openspec/changes/expenses-dashboard-split/design.md` section 5.
 *
 * `.strict()` — any unknown field (including `business_id`) is rejected
 * outright rather than silently dropped, matching `lib/schemas/payment.ts`'s
 * established convention. `amount` is an integer minor unit (COP cents),
 * REQUIRED to be a whole number — `.int()` enforces the spec's "Non-integer
 * amount rejected" scenario explicitly (a deliberate addition over
 * design.md's illustrative `.positive()`-only snippet, which the spec's own
 * acceptance scenario requires). `amount` is also capped at
 * `MAX_AMOUNT_COP_CENTS` (Postgres `INTEGER`'s max value) so an
 * out-of-range amount fails cleanly here with a 400, instead of reaching
 * the database and failing with a raw, unclean Postgres error.
 */

import { z } from "zod";
import { MAX_AMOUNT_COP_CENTS } from "./shared";

const DESCRIPTION_MAX = 300;
const NOTES_MAX = 1000;

const dateSchema = z
  .string()
  .trim()
  .min(1)
  .refine((value) => !Number.isNaN(Date.parse(value)), { message: "Invalid date." });

export const expenseCreateSchema = z
  .object({
    category: z.enum(["nomina", "otro"]),
    expenseDate: dateSchema,
    description: z.string().trim().min(1).max(DESCRIPTION_MAX),
    amount: z.number().int().positive().max(MAX_AMOUNT_COP_CENTS),
    notes: z.string().trim().max(NOTES_MAX).optional(),
  })
  .strict();

export type ExpenseCreateInput = z.infer<typeof expenseCreateSchema>;
