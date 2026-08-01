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
 *
 * The month helpers this file used to duplicate from `dashboard-service.ts`
 * (`monthKey`/`monthLabel`/`recentMonthKeys`, plus `currentMonthPrefix`) are
 * gone: both services now share `lib/services/dashboard-period.ts`, which is
 * where the `?period=` selector's resolved range and chart buckets come from.
 * Keeping three copies of month arithmetic in sync stopped being defensible
 * once the range became user-selectable.
 */

import { repositories } from "@/lib/services/repositories";
import type { Expense, ExpenseCategory, Session } from "@/lib/services/ports";
import { monthEnd, monthShortLabel, monthStart, type DashboardPeriod } from "@/lib/services/dashboard-period";

const ALL_ROWS = Number.MAX_SAFE_INTEGER;
const DEFAULT_RECENT_EXPENSES_LIMIT = 5;

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
  /**
   * Total spent within the requested period. Keeps its `totalThisMonth` name
   * for the composite's existing consumers; with no `?period=` the default
   * period IS the current month, so the name stays accurate there.
   */
  totalThisMonth: number;
  byCategory: ExpensesByCategoryDatum[];
  recentExpenses: Expense[];
};

/**
 * Every expense figure on the dashboard is range-scoped — unlike
 * `dashboard-service.ts`, this file has no point-in-time counterpart to
 * `getPendingBalance`, because an expense has no running balance to be "as
 * of today". So `period` is required, not optional, on every function here.
 */
async function listExpenses(session: Session, range: { from?: string; to?: string }): Promise<Expense[]> {
  const paged = await repositories.expenses.list(session.businessId, {
    from: range.from,
    to: range.to,
    page: 1,
    pageSize: ALL_ROWS,
  });
  return paged.data;
}

/** The span the trend chart covers, which is wider than `period` for a single month (6 trailing buckets). */
function chartRange(period: DashboardPeriod): { from: string; to: string } {
  return {
    from: monthStart(period.chartMonths[0]),
    to: monthEnd(period.chartMonths[period.chartMonths.length - 1]),
  };
}

/** "Egresos del periodo": sum of amounts whose `expenseDate` falls inside `period`. */
export async function getExpensesTotalInPeriod(session: Session, period: DashboardPeriod): Promise<number> {
  const expenses = await listExpenses(session, period);
  return expenses.reduce((sum, e) => sum + e.amount, 0);
}

/** Totals per category within `period`, always emitting all categories in fixed order (zeros included), like receivablesByStatus. */
export async function getExpensesByCategory(
  session: Session,
  period: DashboardPeriod,
): Promise<ExpensesByCategoryDatum[]> {
  const expenses = await listExpenses(session, period);
  return CATEGORY_ORDER.map((category) => ({
    category,
    label: CATEGORY_META[category].label,
    total: expenses.filter((e) => e.category === category).reduce((sum, e) => sum + e.amount, 0),
  }));
}

/**
 * "Gastos recientes": the `limit` most recent expenses inside `period`, newest
 * first (tiebreak by createdAt), like getRecentPayments.
 */
export async function getRecentExpenses(
  session: Session,
  period: DashboardPeriod,
  limit: number = DEFAULT_RECENT_EXPENSES_LIMIT,
): Promise<Expense[]> {
  const expenses = await listExpenses(session, period);
  return [...expenses]
    .sort((a, b) => {
      if (a.expenseDate !== b.expenseDate) return a.expenseDate < b.expenseDate ? 1 : -1;
      return a.createdAt < b.createdAt ? 1 : -1;
    })
    .slice(0, limit);
}

/**
 * "Gastos por mes": total expense amount per calendar month across
 * `period.chartMonths`, every bucket emitted (zeros included), newest-last —
 * mirrors `dashboard-service.ts`'s `getDashboardCharts`' `monthlyPayments`.
 */
export async function getExpensesByMonth(session: Session, period: DashboardPeriod): Promise<ExpensesByMonthDatum[]> {
  const expenses = await listExpenses(session, chartRange(period));

  const months = period.chartMonths;
  const amountsByMonth = new Map(months.map((month) => [month, 0]));
  for (const expense of expenses) {
    const expenseMonth = expense.expenseDate.slice(0, 7);
    if (amountsByMonth.has(expenseMonth)) {
      amountsByMonth.set(expenseMonth, amountsByMonth.get(expenseMonth)! + expense.amount);
    }
  }

  return months.map((month) => ({
    month,
    label: monthShortLabel(month),
    amount: amountsByMonth.get(month) ?? 0,
  }));
}

/** Composite for a future `/api/expenses/summary` (not built this phase) — mirrors getDashboardSummary. */
export async function getExpensesSummary(session: Session, period: DashboardPeriod): Promise<ExpensesSummary> {
  const [totalThisMonth, byCategory, recentExpenses] = await Promise.all([
    getExpensesTotalInPeriod(session, period),
    getExpensesByCategory(session, period),
    getRecentExpenses(session, period),
  ]);
  return { totalThisMonth, byCategory, recentExpenses };
}
