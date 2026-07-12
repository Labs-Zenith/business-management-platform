import { beforeEach, describe, expect, it } from "vitest";
import type { Employee, ExpenseInput, PayrollPaymentPersist } from "@/lib/services/ports";
import { createEmployeeRepository } from "./employee-repo";
import { createPayrollRepository } from "./payroll-repo";
import { createEmptyStore, type MockStore } from "./store";

/**
 * SAFETY-CRITICAL: proves the mock payroll repository's `create` is
 * genuinely atomic — both the `payroll_payments` row AND its linked
 * `category:'nomina'` expense exist immediately after `create` resolves,
 * with nothing observably in-between. Mirrors `payment-service.test.ts`'s
 * partial-state-impossibility technique, exercising the REAL mock store
 * (not a mocked repository).
 */

const BUSINESS_ID = "10000000-0000-4000-8000-000000000001";
const OTHER_BUSINESS_ID = "10000000-0000-4000-8000-000000000099";

let store: MockStore;
let employee: Employee;

beforeEach(async () => {
  store = createEmptyStore();
  const employeeRepo = createEmployeeRepository(store);
  employee = await employeeRepo.create(BUSINESS_ID, { name: "Laura Martinez", baseSalary: 2000000 });
});

function buildPersist(overrides: Partial<PayrollPaymentPersist> = {}): PayrollPaymentPersist {
  return {
    employeeId: employee.id,
    amount: 1000000,
    periodType: "quincenal",
    periodStart: "2026-07-01",
    periodEnd: "2026-07-15",
    paymentDate: "2026-07-16",
    notes: null,
    ...overrides,
  };
}

function buildExpenseInput(overrides: Partial<ExpenseInput> = {}): ExpenseInput {
  return {
    category: "nomina",
    expenseDate: "2026-07-16",
    description: "Nomina Laura Martinez (2026-07-01 - 2026-07-15)",
    amount: 1000000,
    notes: null,
    ...overrides,
  };
}

describe("createPayrollRepository.create — atomicity", () => {
  it("persists BOTH the payroll payment AND its linked nomina expense together, before create() even resolves", () => {
    const repo = createPayrollRepository(store);

    // Deliberately do NOT await here first — call synchronously and inspect
    // the store on the very next synchronous tick, before the promise chain
    // has a chance to run any interleaved code. Since `create()` performs no
    // `await` before both `Map.set()` calls, the writes are already done by
    // the time this line runs (the function body up to its first `await`
    // — of which there is none in `create` — executes synchronously).
    const resultPromise = repo.create(BUSINESS_ID, buildPersist(), buildExpenseInput());

    // Both rows must already exist synchronously — proving there is no
    // observable window where one exists without the other.
    expect(store.payrollPayments.size).toBe(1);
    expect(store.expenses.size).toBe(1);
    const persistedPayment = [...store.payrollPayments.values()][0]!;
    const persistedExpense = [...store.expenses.values()][0]!;
    expect(persistedPayment.employeeId).toBe(employee.id);
    expect(persistedExpense.category).toBe("nomina");
    expect(persistedExpense.amount).toBe(1000000);

    return resultPromise.then((payment) => {
      expect(payment.id).toBe(persistedPayment.id);
    });
  });

  it("persists both rows scoped to businessId, correctly wired end to end", async () => {
    const repo = createPayrollRepository(store);

    const payment = await repo.create(BUSINESS_ID, buildPersist(), buildExpenseInput());

    expect(payment.businessId).toBe(BUSINESS_ID);
    const linkedExpense = [...store.expenses.values()].find((e) => e.description.includes("Laura Martinez"));
    expect(linkedExpense).toBeDefined();
    expect(linkedExpense!.businessId).toBe(BUSINESS_ID);
    expect(linkedExpense!.category).toBe("nomina");
  });
});

describe("createPayrollRepository.getById — business_id scoping", () => {
  it("returns the payment with employee name when it belongs to the requesting business", async () => {
    const repo = createPayrollRepository(store);
    const created = await repo.create(BUSINESS_ID, buildPersist(), buildExpenseInput());

    const found = await repo.getById(BUSINESS_ID, created.id);

    expect(found).not.toBeNull();
    expect(found!.employee.name).toBe("Laura Martinez");
  });

  it("returns null (not a leaked record) for a payment belonging to another business", async () => {
    const repo = createPayrollRepository(store);
    const created = await repo.create(BUSINESS_ID, buildPersist(), buildExpenseInput());

    const found = await repo.getById(OTHER_BUSINESS_ID, created.id);

    expect(found).toBeNull();
  });
});

describe("createPayrollRepository.list", () => {
  it("returns only payroll payments scoped to businessId", async () => {
    const repo = createPayrollRepository(store);
    await repo.create(BUSINESS_ID, buildPersist(), buildExpenseInput());
    await repo.create(OTHER_BUSINESS_ID, buildPersist(), buildExpenseInput());

    const result = await repo.list(BUSINESS_ID, { page: 1, pageSize: 20 });

    expect(result.total).toBe(1);
    expect(result.data.every((p) => p.businessId === BUSINESS_ID)).toBe(true);
  });

  it("filters by employeeId", async () => {
    const repo = createPayrollRepository(store);
    const employeeRepo = createEmployeeRepository(store);
    const employee2 = await employeeRepo.create(BUSINESS_ID, { name: "Miguel Sanchez", baseSalary: 1800000 });
    await repo.create(BUSINESS_ID, buildPersist(), buildExpenseInput());
    await repo.create(BUSINESS_ID, buildPersist({ employeeId: employee2.id }), buildExpenseInput());

    const result = await repo.list(BUSINESS_ID, { page: 1, pageSize: 20, employeeId: employee2.id });

    expect(result.data).toHaveLength(1);
    expect(result.data[0]!.employeeId).toBe(employee2.id);
  });

  it("has no update or delete operation on the repository interface (append-only)", () => {
    const repo = createPayrollRepository(store);
    expect((repo as unknown as Record<string, unknown>).update).toBeUndefined();
    expect((repo as unknown as Record<string, unknown>).delete).toBeUndefined();
  });
});
