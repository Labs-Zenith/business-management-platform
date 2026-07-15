import "@/lib/zod-locale";
/**
 * Shared constants for `lib/schemas/*` input schemas.
 *
 * Extracted so a future change to the underlying Postgres column type (e.g.
 * `employees.base_salary`, `payroll_payments.amount`, `expenses.amount`) only
 * requires one edit instead of three independent copies.
 */

/** Matches Postgres `INTEGER`'s max value — the column type used for all
 * COP-cents amount columns in this schema (`employees.base_salary`,
 * `payroll_payments.amount`, `expenses.amount`). */
export const MAX_AMOUNT_COP_CENTS = 2_147_483_647;
