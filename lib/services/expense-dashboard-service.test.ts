import { describe, expect, it } from "vitest";
import type { Session } from "@/lib/services/ports";
import { parsePeriodParam } from "@/lib/services/dashboard-period";
import { createExpense } from "./expense-service";
import {
  getExpensesByCategory,
  getExpensesByMonth,
  getExpensesSummary,
  getExpensesTotalInPeriod,
  getRecentExpenses,
} from "./expense-dashboard-service";

/**
 * Mirrors `dashboard-service.test.ts`'s technique: exercises the REAL mock
 * store via `expense-service.createExpense`, with fresh random business ids
 * per test so cross-business isolation is a genuine leak-detector, not
 * dependent on `resetStore()` cleanup alone.
 */

function newBusinessId(): string {
  return crypto.randomUUID();
}

function sessionFor(businessId: string): Session {
  return { userId: crypto.randomUUID(), businessId, email: "owner@negocio.test", role: "admin" };
}

const NOW = new Date();
// Derived with the SAME local-time getters `currentMonthPrefix(now)` (the
// production function under test) uses — NOT `toISOString()` (UTC). Near a
// month boundary in a timezone behind UTC (e.g. Colombia, UTC-5, this app's
// target locale), `toISOString()` can already read into next month while
// `getFullYear()`/`getMonth()` still read the current one, which would make
// this constant disagree with production's own month math and flake. Day 15
// keeps it safely mid-month regardless.
const THIS_MONTH_DATE = `${NOW.getFullYear()}-${String(NOW.getMonth() + 1).padStart(2, "0")}-15`;
const THIS_MONTH_KEY = THIS_MONTH_DATE.slice(0, 7);
const PREVIOUS_MONTH = new Date(NOW.getFullYear(), NOW.getMonth() - 2, 15);
const PREVIOUS_MONTH_DATE = `${PREVIOUS_MONTH.getFullYear()}-${String(PREVIOUS_MONTH.getMonth() + 1).padStart(2, "0")}-15`;
const PREVIOUS_MONTH_KEY = PREVIOUS_MONTH_DATE.slice(0, 7);

// The CURRENT CALENDAR MONTH, requested explicitly. Not `parsePeriodParam(undefined)`:
// that now resolves to the rolling 30-day window, which ends today — and these
// fixtures deliberately sit on day 15, which is in the future for the first
// half of any month. These tests are about month scoping, so they ask for the
// month by key.
const CURRENT_MONTH_PERIOD = parsePeriodParam(THIS_MONTH_KEY, NOW);
const PREVIOUS_MONTH_PERIOD = parsePeriodParam(PREVIOUS_MONTH_KEY, NOW);
// Unbounded: used by tests about ordering/isolation, where date filtering is
// beside the point and hardcoded fixture dates shouldn't have to stay inside
// whatever month the suite happens to run in.
const ALL_TIME_PERIOD = parsePeriodParam("all", NOW);

describe("getExpensesTotalInPeriod", () => {
  it("sums only expenses whose expenseDate falls in the period, scoped to businessId", async () => {
    const businessA = newBusinessId();
    const businessB = newBusinessId();
    const sessionA = sessionFor(businessA);
    const sessionB = sessionFor(businessB);

    await createExpense(sessionA, { category: "otro", expenseDate: THIS_MONTH_DATE, description: "Este mes", amount: 100_000 });
    await createExpense(sessionA, {
      category: "nomina",
      expenseDate: PREVIOUS_MONTH_DATE,
      description: "Mes anterior",
      amount: 500_000,
    });
    await createExpense(sessionB, {
      category: "otro",
      expenseDate: THIS_MONTH_DATE,
      description: "De otro negocio",
      amount: 9_000_000,
    });

    expect(await getExpensesTotalInPeriod(sessionA, CURRENT_MONTH_PERIOD)).toBe(100_000);
    // Picking the earlier month surfaces the expense the current-month view
    // hides — the reason the selector exists.
    expect(await getExpensesTotalInPeriod(sessionA, PREVIOUS_MONTH_PERIOD)).toBe(500_000);
    // "Todo" is unbounded, so it sums both.
    expect(await getExpensesTotalInPeriod(sessionA, ALL_TIME_PERIOD)).toBe(600_000);
  });

  it("returns 0 for a business with no expenses", async () => {
    const session = sessionFor(newBusinessId());

    const total = await getExpensesTotalInPeriod(session, CURRENT_MONTH_PERIOD);

    expect(total).toBe(0);
  });
});

describe("getExpensesByCategory", () => {
  it("always emits both categories in fixed order, with zeros included, scoped to businessId", async () => {
    const businessA = newBusinessId();
    const businessB = newBusinessId();
    const sessionA = sessionFor(businessA);
    const sessionB = sessionFor(businessB);

    await createExpense(sessionA, { category: "nomina", expenseDate: THIS_MONTH_DATE, description: "N1", amount: 300_000 });
    await createExpense(sessionA, { category: "nomina", expenseDate: THIS_MONTH_DATE, description: "N2", amount: 200_000 });
    await createExpense(sessionB, { category: "otro", expenseDate: THIS_MONTH_DATE, description: "De otro negocio", amount: 9_000_000 });

    const byCategory = await getExpensesByCategory(sessionA, CURRENT_MONTH_PERIOD);

    expect(byCategory).toEqual([
      { category: "nomina", label: "Nómina", total: 500_000 },
      { category: "otro", label: "Otro", total: 0 },
    ]);
  });

  it("is scoped to the period, so an out-of-period expense drops to zero", async () => {
    const session = sessionFor(newBusinessId());
    await createExpense(session, {
      category: "nomina",
      expenseDate: PREVIOUS_MONTH_DATE,
      description: "Mes anterior",
      amount: 700_000,
    });

    expect(await getExpensesByCategory(session, CURRENT_MONTH_PERIOD)).toEqual([
      { category: "nomina", label: "Nómina", total: 0 },
      { category: "otro", label: "Otro", total: 0 },
    ]);
    expect(await getExpensesByCategory(session, PREVIOUS_MONTH_PERIOD)).toEqual([
      { category: "nomina", label: "Nómina", total: 700_000 },
      { category: "otro", label: "Otro", total: 0 },
    ]);
  });
});

describe("getRecentExpenses", () => {
  it("returns the limit most recent expenses, newest first by expenseDate", async () => {
    const session = sessionFor(newBusinessId());
    await createExpense(session, { category: "otro", expenseDate: "2026-07-01", description: "Viejo", amount: 10_000 });
    await createExpense(session, { category: "otro", expenseDate: "2026-07-20", description: "Reciente", amount: 20_000 });
    await createExpense(session, { category: "nomina", expenseDate: "2026-07-10", description: "Medio", amount: 30_000 });

    const recent = await getRecentExpenses(session, ALL_TIME_PERIOD, 2);

    expect(recent).toHaveLength(2);
    expect(recent.map((e) => e.description)).toEqual(["Reciente", "Medio"]);
  });

  it("never includes another business's expenses", async () => {
    const businessA = newBusinessId();
    const businessB = newBusinessId();
    const sessionA = sessionFor(businessA);
    const sessionB = sessionFor(businessB);
    await createExpense(sessionB, { category: "otro", expenseDate: "2026-07-25", description: "Ajeno", amount: 1_000_000 });

    const recent = await getRecentExpenses(sessionA, ALL_TIME_PERIOD);

    expect(recent.some((e) => e.description === "Ajeno")).toBe(false);
  });

  it("only lists expenses inside the period", async () => {
    const session = sessionFor(newBusinessId());
    await createExpense(session, {
      category: "otro",
      expenseDate: THIS_MONTH_DATE,
      description: "Del periodo",
      amount: 10_000,
    });
    await createExpense(session, {
      category: "otro",
      expenseDate: PREVIOUS_MONTH_DATE,
      description: "Fuera del periodo",
      amount: 20_000,
    });

    const recent = await getRecentExpenses(session, CURRENT_MONTH_PERIOD);

    expect(recent.map((e) => e.description)).toEqual(["Del periodo"]);
  });
});

describe("getExpensesByMonth", () => {
  it("buckets by month over the default window, zero-filled, newest-last, scoped to businessId", async () => {
    const businessA = newBusinessId();
    const businessB = newBusinessId();
    const sessionA = sessionFor(businessA);
    const sessionB = sessionFor(businessB);

    await createExpense(sessionA, {
      category: "otro",
      expenseDate: THIS_MONTH_DATE,
      description: "Este mes",
      amount: 80_000,
    });
    await createExpense(sessionA, {
      category: "nomina",
      expenseDate: PREVIOUS_MONTH_DATE,
      description: "Mes anterior",
      amount: 20_000,
    });
    await createExpense(sessionB, {
      category: "otro",
      expenseDate: THIS_MONTH_DATE,
      description: "De otro negocio",
      amount: 9_000_000,
    });

    const months = await getExpensesByMonth(sessionA, CURRENT_MONTH_PERIOD);

    expect(months).toHaveLength(6);
    expect(months[months.length - 1]!.month).toBe(THIS_MONTH_KEY);
    expect(months.find((month) => month.month === THIS_MONTH_KEY)).toMatchObject({
      month: THIS_MONTH_KEY,
      amount: 80_000,
    });
    expect(months.find((month) => month.month === PREVIOUS_MONTH_KEY)).toMatchObject({
      month: PREVIOUS_MONTH_KEY,
      amount: 20_000,
    });
    expect(months.every((month) => month.amount < 9_000_000)).toBe(true);
  });

  it("returns every bucket (zeros included) for a business with no expenses", async () => {
    const session = sessionFor(newBusinessId());

    const months = await getExpensesByMonth(session, CURRENT_MONTH_PERIOD);

    expect(months).toHaveLength(6);
    expect(months.every((month) => month.amount === 0)).toBe(true);
  });

  it("follows the period's chart buckets, so a shorter preset yields fewer months", async () => {
    const session = sessionFor(newBusinessId());

    const months = await getExpensesByMonth(session, parsePeriodParam("last3", NOW));

    expect(months).toHaveLength(3);
    expect(months[months.length - 1]!.month).toBe(THIS_MONTH_KEY);
  });

  it("keeps the 6-month trend when a single past month is selected, ending at that month", async () => {
    const session = sessionFor(newBusinessId());
    await createExpense(session, {
      category: "otro",
      expenseDate: PREVIOUS_MONTH_DATE,
      description: "Mes anterior",
      amount: 45_000,
    });

    const months = await getExpensesByMonth(session, PREVIOUS_MONTH_PERIOD);

    expect(months).toHaveLength(6);
    expect(months[months.length - 1]!.month).toBe(PREVIOUS_MONTH_KEY);
    expect(months[months.length - 1]!.amount).toBe(45_000);
    // The current month is past the selected one, so it isn't a bucket at all.
    expect(months.some((month) => month.month === THIS_MONTH_KEY)).toBe(false);
  });
});

describe("getExpensesSummary", () => {
  it("composes totalThisMonth, byCategory, and recentExpenses in one payload", async () => {
    const session = sessionFor(newBusinessId());
    await createExpense(session, { category: "nomina", expenseDate: THIS_MONTH_DATE, description: "Nomina", amount: 400_000 });

    const summary = await getExpensesSummary(session, CURRENT_MONTH_PERIOD);

    expect(summary.totalThisMonth).toBe(400_000);
    expect(summary.byCategory).toEqual([
      { category: "nomina", label: "Nómina", total: 400_000 },
      { category: "otro", label: "Otro", total: 0 },
    ]);
    expect(summary.recentExpenses).toHaveLength(1);
  });
});
