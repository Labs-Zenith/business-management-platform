import { beforeEach, describe, expect, it } from "vitest";
import type { ExpenseInput } from "@/lib/services/ports";
import { createExpenseRepository } from "./expense-repo";
import { createEmptyStore, type MockStore } from "./store";

/**
 * Mirrors `lib/mock/payment-repo.test.ts`'s scope (business_id scoping,
 * filtering, pagination), adapted for expenses' simpler shape (no lock, no
 * balance invariant — a plain scoped CRUD).
 */

const BUSINESS_ID = "10000000-0000-4000-8000-000000000001";
const OTHER_BUSINESS_ID = "10000000-0000-4000-8000-000000000099";

function buildInput(overrides: Partial<ExpenseInput> = {}): ExpenseInput {
  return {
    category: "otro",
    expenseDate: "2026-07-01",
    description: "Papeleria",
    amount: 50000,
    notes: null,
    ...overrides,
  };
}

let store: MockStore;

beforeEach(() => {
  store = createEmptyStore();
});

describe("createExpenseRepository.create", () => {
  it("persists the expense with businessId from the arg, ignoring any businessId-shaped field on data", () => {
    const repo = createExpenseRepository(store);

    return repo.create(BUSINESS_ID, buildInput()).then((expense) => {
      expect(expense.businessId).toBe(BUSINESS_ID);
      expect(expense.category).toBe("otro");
      expect(expense.description).toBe("Papeleria");
      expect(expense.amount).toBe(50000);
      expect(expense.notes).toBeNull();
      expect(store.expenses.get(expense.id)).toEqual(expense);
    });
  });

  it("defaults notes to null when omitted", async () => {
    const repo = createExpenseRepository(store);
    const input: ExpenseInput = {
      category: "otro",
      expenseDate: "2026-07-01",
      description: "Papeleria",
      amount: 50000,
    };

    const expense = await repo.create(BUSINESS_ID, input);

    expect(expense.notes).toBeNull();
  });
});

describe("createExpenseRepository.getById — business_id scoping", () => {
  it("returns the expense when it belongs to the requesting business", async () => {
    const repo = createExpenseRepository(store);
    const created = await repo.create(BUSINESS_ID, buildInput());

    const found = await repo.getById(BUSINESS_ID, created.id);

    expect(found).not.toBeNull();
    expect(found!.id).toBe(created.id);
  });

  it("returns null (not a leaked record) for an expense belonging to another business", async () => {
    const repo = createExpenseRepository(store);
    const created = await repo.create(BUSINESS_ID, buildInput());

    const found = await repo.getById(OTHER_BUSINESS_ID, created.id);

    expect(found).toBeNull();
  });

  it("returns null for a missing expense id", async () => {
    const repo = createExpenseRepository(store);

    const found = await repo.getById(BUSINESS_ID, "00000000-0000-4000-8000-000000000000");

    expect(found).toBeNull();
  });
});

describe("createExpenseRepository.list", () => {
  it("returns only expenses scoped to businessId, newest first", async () => {
    const repo = createExpenseRepository(store);
    await repo.create(BUSINESS_ID, buildInput({ expenseDate: "2026-07-01", description: "Primero" }));
    await repo.create(BUSINESS_ID, buildInput({ expenseDate: "2026-07-15", description: "Segundo" }));
    await repo.create(OTHER_BUSINESS_ID, buildInput({ expenseDate: "2026-07-20", description: "De otro negocio" }));

    const result = await repo.list(BUSINESS_ID, { page: 1, pageSize: 20 });

    expect(result.total).toBe(2);
    expect(result.data.map((e) => e.description)).toEqual(["Segundo", "Primero"]);
    expect(result.data.every((e) => e.businessId === BUSINESS_ID)).toBe(true);
  });

  it("filters by category", async () => {
    const repo = createExpenseRepository(store);
    await repo.create(BUSINESS_ID, buildInput({ category: "nomina", description: "Nomina julio" }));
    await repo.create(BUSINESS_ID, buildInput({ category: "otro", description: "Gasto varios" }));

    const result = await repo.list(BUSINESS_ID, { page: 1, pageSize: 20, category: "nomina" });

    expect(result.data).toHaveLength(1);
    expect(result.data[0]!.category).toBe("nomina");
  });

  it("filters by from/to date range", async () => {
    const repo = createExpenseRepository(store);
    await repo.create(BUSINESS_ID, buildInput({ expenseDate: "2026-06-01", description: "Fuera de rango (antes)" }));
    await repo.create(BUSINESS_ID, buildInput({ expenseDate: "2026-07-10", description: "Dentro de rango" }));
    await repo.create(BUSINESS_ID, buildInput({ expenseDate: "2026-08-01", description: "Fuera de rango (despues)" }));

    const result = await repo.list(BUSINESS_ID, { page: 1, pageSize: 20, from: "2026-07-01", to: "2026-07-31" });

    expect(result.data).toHaveLength(1);
    expect(result.data[0]!.description).toBe("Dentro de rango");
  });

  it("includes expenses exactly on the from/to boundary dates (inclusive range)", async () => {
    const repo = createExpenseRepository(store);
    await repo.create(BUSINESS_ID, buildInput({ expenseDate: "2026-07-01", description: "En el limite inferior" }));
    await repo.create(BUSINESS_ID, buildInput({ expenseDate: "2026-07-31", description: "En el limite superior" }));
    await repo.create(BUSINESS_ID, buildInput({ expenseDate: "2026-06-30", description: "Fuera, justo antes" }));
    await repo.create(BUSINESS_ID, buildInput({ expenseDate: "2026-08-01", description: "Fuera, justo despues" }));

    const result = await repo.list(BUSINESS_ID, { page: 1, pageSize: 20, from: "2026-07-01", to: "2026-07-31" });

    expect(result.data.map((e) => e.description).sort()).toEqual(
      ["En el limite inferior", "En el limite superior"].sort(),
    );
  });

  it("paginates results", async () => {
    const repo = createExpenseRepository(store);
    for (let i = 0; i < 5; i += 1) {
      await repo.create(BUSINESS_ID, buildInput({ expenseDate: `2026-07-0${i + 1}`, description: `Gasto ${i}` }));
    }

    const page1 = await repo.list(BUSINESS_ID, { page: 1, pageSize: 2 });
    const page2 = await repo.list(BUSINESS_ID, { page: 2, pageSize: 2 });

    expect(page1.data).toHaveLength(2);
    expect(page2.data).toHaveLength(2);
    expect(page1.total).toBe(5);
    expect(page1.data[0]!.id).not.toBe(page2.data[0]!.id);
  });

  it("returns an empty page when requesting a page beyond the last page, with total still reflecting the real count", async () => {
    const repo = createExpenseRepository(store);
    for (let i = 0; i < 3; i += 1) {
      await repo.create(BUSINESS_ID, buildInput({ expenseDate: `2026-07-0${i + 1}`, description: `Gasto ${i}` }));
    }

    const result = await repo.list(BUSINESS_ID, { page: 5, pageSize: 2 });

    expect(result.data).toEqual([]);
    expect(result.total).toBe(3);
  });
});
