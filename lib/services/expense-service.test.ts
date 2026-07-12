import { describe, expect, it } from "vitest";
import { ApiError } from "@/lib/server/api-error";
import { resetStore, store } from "@/lib/mock/store";
import type { Session } from "@/lib/services/ports";
import { createExpense, getExpense, listExpenses } from "./expense-service";

/**
 * Mirrors `payment-service.test.ts`'s technique: exercises the REAL mock
 * store (not a mocked repository) so business_id scoping is an observable
 * fact, not just an assertion about a thrown error.
 */

const BUSINESS_ID = "10000000-0000-4000-8000-000000000001";
const OTHER_BUSINESS_ID = "10000000-0000-4000-8000-000000000099";

const SESSION: Session = {
  userId: "20000000-0000-4000-8000-000000000001",
  businessId: BUSINESS_ID,
  email: "demo@negociodemo.test",
  role: "admin",
};

describe("createExpense (expense-service)", () => {
  it("ALWAYS derives businessId from the session, ignoring any businessId-shaped value forged into data", async () => {
    resetStore();
    const forgedData = {
      category: "otro" as const,
      expenseDate: "2026-07-01",
      description: "Gasto forjado",
      amount: 50000,
      businessId: OTHER_BUSINESS_ID,
    } as unknown as Parameters<typeof createExpense>[1];

    const expense = await createExpense(SESSION, forgedData);

    expect(expense.businessId).toBe(BUSINESS_ID);
    expect(expense.businessId).not.toBe(OTHER_BUSINESS_ID);
    const persisted = store.expenses.get(expense.id);
    expect(persisted!.businessId).toBe(BUSINESS_ID);
  });

  it("is reusable by a non-route caller with an already-resolved session, creating a nomina expense identically", async () => {
    resetStore();

    const expense = await createExpense(SESSION, {
      category: "nomina",
      expenseDate: "2026-07-15",
      description: "Pago nomina automatico",
      amount: 2000000,
    });

    expect(expense.category).toBe("nomina");
    expect(expense.businessId).toBe(BUSINESS_ID);
    expect(store.expenses.get(expense.id)).toBeDefined();
  });

  it("defaults notes to null when omitted", async () => {
    resetStore();

    const expense = await createExpense(SESSION, {
      category: "otro",
      expenseDate: "2026-07-01",
      description: "Sin notas",
      amount: 10000,
    });

    expect(expense.notes).toBeNull();
  });

  it("rejects an invalid amount even when called directly, bypassing the /api/expenses route entirely", async () => {
    resetStore();
    const before = await listExpenses(SESSION, { page: 1, pageSize: 20 });

    await expect(
      createExpense(SESSION, {
        category: "otro",
        expenseDate: "2026-07-01",
        description: "Monto invalido",
        amount: -500,
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });

    const after = await listExpenses(SESSION, { page: 1, pageSize: 20 });
    expect(after.total).toBe(before.total);
    expect(after.data.some((e) => e.description === "Monto invalido")).toBe(false);
  });

  it("rejects an invalid category even when called directly, bypassing the /api/expenses route entirely", async () => {
    resetStore();

    await expect(
      createExpense(SESSION, {
        category: "viajes" as unknown as "otro",
        expenseDate: "2026-07-01",
        description: "Categoria invalida",
        amount: 10000,
      }),
    ).rejects.toBeInstanceOf(ApiError);
  });
});

describe("getExpense (expense-service)", () => {
  it("returns the expense when it belongs to the session's business", async () => {
    resetStore();
    const created = await createExpense(SESSION, {
      category: "otro",
      expenseDate: "2026-07-01",
      description: "Consultable",
      amount: 20000,
    });

    const found = await getExpense(SESSION, created.id);

    expect(found.id).toBe(created.id);
  });

  it("throws NOT_FOUND for a cross-business expense id, never leaking the record", async () => {
    resetStore();
    const created = await createExpense(SESSION, {
      category: "otro",
      expenseDate: "2026-07-01",
      description: "De otro negocio",
      amount: 20000,
    });
    const otherSession: Session = { ...SESSION, businessId: OTHER_BUSINESS_ID };

    await expect(getExpense(otherSession, created.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("throws NOT_FOUND for a missing expense id", async () => {
    resetStore();

    await expect(getExpense(SESSION, "00000000-0000-4000-8000-000000000000")).rejects.toBeInstanceOf(ApiError);
  });
});

describe("listExpenses (expense-service)", () => {
  it("lists only the session business's expenses", async () => {
    resetStore();
    await createExpense(SESSION, {
      category: "otro",
      expenseDate: "2026-07-01",
      description: "Propio",
      amount: 10000,
    });
    const otherSession: Session = { ...SESSION, businessId: OTHER_BUSINESS_ID };
    await createExpense(otherSession, {
      category: "otro",
      expenseDate: "2026-07-01",
      description: "Ajeno",
      amount: 999999,
    });

    const result = await listExpenses(SESSION, { page: 1, pageSize: 20 });

    expect(result.data.every((e) => e.businessId === BUSINESS_ID)).toBe(true);
    expect(result.data.some((e) => e.description === "Ajeno")).toBe(false);
  });
});
