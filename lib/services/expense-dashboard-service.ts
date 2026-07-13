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
const DEFAULT_MONTHLY_EXPENSE_BUCKETS = 6;

const CATEGORY_META: Record<ExpenseCategory, { label: string }> = {
  nomina: { label: "Nómina" },
  otro: { label: "Otro" },
};
const CATEGORY_ORDER: ExpenseCategory[] = ["nomina", "otro"];

/**
 * Single source of truth for an `ExpenseCategory`'s display label. Any
 * component rendering a category (e.g. `recent-expenses.tsx`) MUST import
 * this instead of hand-rolling its own label map — a duplicated map is how
 * "Nómina" vs "Nomina" (missing accent) inconsistencies happen.
 */
export function getCategoryLabel(category: ExpenseCategory): string {
  return CATEGORY_META[category].label;
}

export type ExpensesByCategoryDatum = { category: ExpenseCategory; label: string; total: number };
export type ExpensesByMonthDatum = { month: string; label: string; amount: number };
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

/**
 * Duplicated from `dashboard-service.ts`'s private `monthKey`/`monthLabel`/
 * `recentMonthKeys` trio rather than importing them — this file is a
 * deliberate independent parallel service (see file-level doc comment), and
 * those helpers are private (unexported) in `dashboard-service.ts`.
 */
function monthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(key: string): string {
  const [year, month] = key.split("-").map(Number);
  return new Intl.DateTimeFormat("es-CO", { month: "short" }).format(new Date(year, month - 1, 1));
}

function recentMonthKeys(now: Date, count: number): string[] {
  return Array.from({ length: count }, (_, index) => {
    const offset = count - index - 1;
    return monthKey(new Date(now.getFullYear(), now.getMonth() - offset, 1));
  });
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

/**
 * "Gastos por mes": total expense amount per calendar month over the last
 * `monthBuckets` months, every bucket emitted (zeros included), newest-last —
 * mirrors `dashboard-service.ts`'s `getDashboardCharts`' `monthlyPayments`.
 */
export async function getExpensesByMonth(
  session: Session,
  now: Date = new Date(),
  monthBuckets: number = DEFAULT_MONTHLY_EXPENSE_BUCKETS,
): Promise<ExpensesByMonthDatum[]> {
  const expenses = await listAllExpenses(session);

  const months = recentMonthKeys(now, monthBuckets);
  const amountsByMonth = new Map(months.map((month) => [month, 0]));
  for (const expense of expenses) {
    const expenseMonth = expense.expenseDate.slice(0, 7);
    if (amountsByMonth.has(expenseMonth)) {
      amountsByMonth.set(expenseMonth, amountsByMonth.get(expenseMonth)! + expense.amount);
    }
  }

  return months.map((month) => ({
    month,
    label: monthLabel(month),
    amount: amountsByMonth.get(month) ?? 0,
  }));
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
