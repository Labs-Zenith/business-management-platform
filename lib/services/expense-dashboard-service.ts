/**
 * Expense dashboard aggregation service, per
 * `openspec/changes/expenses-dashboard-split/specs/dashboard/spec.md` and
 * `openspec/changes/expenses-dashboard-split/design.md` section 4.
 *
 * Copies `dashboard-service.ts`'s split-small-function + `ALL_ROWS`-fetch +
 * JS-aggregation + `Promise.all` composite pattern, so a future
 * `app/(dashboard)/dashboard/page.tsx` Egresos panel can wrap each in its
 * own independent `<Suspense>` boundary. Every function resolves
 * `businessId` ONLY from `session.businessId`.
 */

import { repositories } from "@/lib/services/repositories";
import type { Expense, ExpenseCategory, Session } from "@/lib/services/ports";

const ALL_ROWS = Number.MAX_SAFE_INTEGER;
const DEFAULT_RECENT_EXPENSES_LIMIT = 5;

const CATEGORY_META: Record<ExpenseCategory, { label: string }> = {
  nomina: { label: "Nómina" },
  otro: { label: "Otro" },
};
const CATEGORY_ORDER: ExpenseCategory[] = ["nomina", "otro"];

export type ExpensesByCategoryDatum = { category: ExpenseCategory; label: string; total: number };
export type ExpensesSummary = {
  totalThisMonth: number;
  byCategory: ExpensesByCategoryDatum[];
  recentExpenses: Expense[];
};

async function listAllExpenses(session: Session): Promise<Expense[]> {
  const paged = await repositories.expenses.list(session.businessId, { page: 1, pageSize: ALL_ROWS });
  return paged.data;
}

function currentMonthPrefix(now: Date): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

/** "Gastos del mes": sum of amounts whose `expenseDate` is in the current calendar month. */
export async function getExpensesTotalThisMonth(session: Session, now: Date = new Date()): Promise<number> {
  const expenses = await listAllExpenses(session);
  const prefix = currentMonthPrefix(now);
  return expenses.filter((e) => e.expenseDate.startsWith(prefix)).reduce((sum, e) => sum + e.amount, 0);
}

/** Totals per category, always emitting all categories in fixed order (zeros included), like receivablesByStatus. */
export async function getExpensesByCategory(session: Session): Promise<ExpensesByCategoryDatum[]> {
  const expenses = await listAllExpenses(session);
  return CATEGORY_ORDER.map((category) => ({
    category,
    label: CATEGORY_META[category].label,
    total: expenses.filter((e) => e.category === category).reduce((sum, e) => sum + e.amount, 0),
  }));
}

/** "Gastos recientes": the `limit` most recent expenses, newest first (tiebreak by createdAt), like getRecentPayments. */
export async function getRecentExpenses(
  session: Session,
  limit: number = DEFAULT_RECENT_EXPENSES_LIMIT,
): Promise<Expense[]> {
  const expenses = await listAllExpenses(session);
  return [...expenses]
    .sort((a, b) => {
      if (a.expenseDate !== b.expenseDate) return a.expenseDate < b.expenseDate ? 1 : -1;
      return a.createdAt < b.createdAt ? 1 : -1;
    })
    .slice(0, limit);
}

/** Composite for a future `/api/expenses/summary` (not built this phase) — mirrors getDashboardSummary. */
export async function getExpensesSummary(session: Session, now: Date = new Date()): Promise<ExpensesSummary> {
  const [totalThisMonth, byCategory, recentExpenses] = await Promise.all([
    getExpensesTotalThisMonth(session, now),
    getExpensesByCategory(session),
    getRecentExpenses(session),
  ]);
  return { totalThisMonth, byCategory, recentExpenses };
}
