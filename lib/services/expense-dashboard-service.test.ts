import { describe, expect, it } from "vitest";
import type { Session } from "@/lib/services/ports";
import { createExpense } from "./expense-service";
import {
  getExpensesByCategory,
  getExpensesByMonth,
  getExpensesSummary,
  getExpensesTotalThisMonth,
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
const PREVIOUS_MONTH_DATE = new Date(NOW.getFullYear(), NOW.getMonth() - 2, 15).toISOString().slice(0, 10);
const PREVIOUS_MONTH_KEY = PREVIOUS_MONTH_DATE.slice(0, 7);

describe("getExpensesTotalThisMonth", () => {
  it("sums only expenses whose expenseDate falls in the current calendar month, scoped to businessId", async () => {
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

    const total = await getExpensesTotalThisMonth(sessionA, NOW);

    expect(total).toBe(100_000);
  });

  it("returns 0 for a business with no expenses", async () => {
    const session = sessionFor(newBusinessId());

    const total = await getExpensesTotalThisMonth(session, NOW);

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

    const byCategory = await getExpensesByCategory(sessionA);

    expect(byCategory).toEqual([
      { category: "nomina", label: "Nómina", total: 500_000 },
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

    const recent = await getRecentExpenses(session, 2);

    expect(recent).toHaveLength(2);
    expect(recent.map((e) => e.description)).toEqual(["Reciente", "Medio"]);
  });

  it("never includes another business's expenses", async () => {
    const businessA = newBusinessId();
    const businessB = newBusinessId();
    const sessionA = sessionFor(businessA);
    const sessionB = sessionFor(businessB);
    await createExpense(sessionB, { category: "otro", expenseDate: "2026-07-25", description: "Ajeno", amount: 1_000_000 });

    const recent = await getRecentExpenses(sessionA);

    expect(recent.some((e) => e.description === "Ajeno")).toBe(false);
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

    const months = await getExpensesByMonth(sessionA, NOW);

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

    const months = await getExpensesByMonth(session, NOW);

    expect(months).toHaveLength(6);
    expect(months.every((month) => month.amount === 0)).toBe(true);
  });

  it("respects a custom monthBuckets count", async () => {
    const session = sessionFor(newBusinessId());

    const months = await getExpensesByMonth(session, NOW, 3);

    expect(months).toHaveLength(3);
  });
});

describe("getExpensesSummary", () => {
  it("composes totalThisMonth, byCategory, and recentExpenses in one payload", async () => {
    const session = sessionFor(newBusinessId());
    await createExpense(session, { category: "nomina", expenseDate: THIS_MONTH_DATE, description: "Nomina", amount: 400_000 });

    const summary = await getExpensesSummary(session, NOW);

    expect(summary.totalThisMonth).toBe(400_000);
    expect(summary.byCategory).toEqual([
      { category: "nomina", label: "Nómina", total: 400_000 },
      { category: "otro", label: "Otro", total: 0 },
    ]);
    expect(summary.recentExpenses).toHaveLength(1);
  });
});
