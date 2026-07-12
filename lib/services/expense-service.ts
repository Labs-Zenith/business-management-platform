/**
 * Expense service, per
 * `openspec/changes/expenses-dashboard-split/specs/expense-tracking/spec.md`
 * and `openspec/changes/expenses-dashboard-split/design.md` section 4.
 *
 * Thin, honest wrappers over `repositories.expenses`, mirroring
 * `payment-service.ts`. `createExpense` is the reuse point for a future
 * Nomina/payroll module, which will call
 * `createExpense(session, { category: "nomina", ... })` directly when
 * payroll is recorded — NOT only through the `/api/expenses` HTTP route.
 * `businessId` is ALWAYS `session.businessId`, never a client-supplied value.
 *
 * Unlike `payment-service.ts`/`invoice-service.ts` (whose validation lives
 * only at the HTTP boundary, in `lib/schemas/*.ts`, because they have no
 * documented non-route caller), `createExpense` re-validates its input with
 * `expenseCreateSchema` INTERNALLY, so a future direct caller (Nomina) that
 * bypasses `/api/expenses` entirely still gets the same amount/category/
 * length invariants enforced — never a route-dependent safety net.
 */

import { expenseCreateSchema } from "@/lib/schemas/expense";
import { ApiError } from "@/lib/server/api-error";
import { repositories } from "@/lib/services/repositories";
import type { Expense, ExpenseInput, ExpenseListQuery, Paged, Session } from "@/lib/services/ports";

export type ExpenseCreateInput = {
  category: ExpenseInput["category"];
  expenseDate: string;
  description: string;
  amount: number;
  notes?: string | null;
};

export async function listExpenses(session: Session, query: ExpenseListQuery): Promise<Paged<Expense>> {
  return repositories.expenses.list(session.businessId, query);
}

/** Scoped to `session.businessId`; cross-business or missing -> `NOT_FOUND`, never a leaked record. */
export async function getExpense(session: Session, id: string): Promise<Expense> {
  const expense = await repositories.expenses.getById(session.businessId, id);
  if (!expense) {
    throw new ApiError("NOT_FOUND", "Expense not found.");
  }
  return expense;
}

/**
 * Reusable by any caller — the HTTP route AND a future Nomina payroll
 * insert. `businessId` is ALWAYS `session.businessId`, never client-supplied.
 *
 * Re-validates `data` against `expenseCreateSchema` before ever touching the
 * repository: the HTTP route already does this at the boundary, but a
 * direct non-route caller (e.g. a future Nomina insert) MUST NOT be able to
 * slip a negative/fractional amount or an invalid category straight into
 * the database just because it skipped `/api/expenses`. Only the 5
 * known-safe fields are ever forwarded to the schema — a forged
 * `businessId`-shaped field on `data` is structurally impossible to leak
 * through here even before `.strict()` would reject it.
 */
export async function createExpense(session: Session, data: ExpenseCreateInput): Promise<Expense> {
  const parsed = expenseCreateSchema.safeParse({
    category: data.category,
    expenseDate: data.expenseDate,
    description: data.description,
    amount: data.amount,
    notes: data.notes ?? undefined,
  });
  if (!parsed.success) {
    throw new ApiError("VALIDATION_ERROR", "Invalid expense payload.", parsed.error.flatten());
  }

  const persist: ExpenseInput = {
    category: parsed.data.category,
    expenseDate: parsed.data.expenseDate,
    description: parsed.data.description,
    amount: parsed.data.amount,
    notes: parsed.data.notes ?? null,
  };
  return repositories.expenses.create(session.businessId, persist);
}
