import { beforeEach, describe, expect, it } from "vitest";
import type {
  Customer,
  Employee,
  Expense,
  InventoryMovement,
  Payment,
  PayrollPayment,
  Product,
} from "@/lib/services/ports";
import { createCustomerRepository } from "./customer-repo";
import { createEmployeeRepository } from "./employee-repo";
import { createExpenseRepository } from "./expense-repo";
import { createPaymentRepository } from "./payment-repo";
import { createPayrollRepository } from "./payroll-repo";
import { createProductRepository } from "./product-repo";
import { createEmptyStore, type MockStore } from "./store";

/**
 * Repository-level column sorting for the mock backend, across every entity
 * that backs a list table. Kept in one file rather than sprinkled through the
 * per-entity test files because the behavior under test is a single shared
 * mechanism (`lib/services/sorting.ts`), and because the highest-value cases
 * cut across entities: sorting by a DERIVED column.
 *
 * `balance`, `currentQuantity`, `totalValue` and `employee.name` do not exist
 * on the stored row — they are computed by an enrichment map inside `list`.
 * Before column sorting these repos sorted BEFORE that map, so those
 * assertions are what prove the sort was correctly relocated after it. The
 * paired Postgres coverage is `lib/db/repo-sorting.test.ts`.
 */

const BUSINESS_ID = "10000000-0000-4000-8000-000000000001";
const PAGE = { page: 1, pageSize: 20 };

let store: MockStore;

beforeEach(() => {
  store = createEmptyStore();
});

const ids = (result: { data: Array<{ id: string }> }) => result.data.map((row) => row.id);

function seedCustomer(id: string, name: string, phone: string | null = null): void {
  store.customers.set(id, {
    id,
    businessId: BUSINESS_ID,
    name,
    documentNumber: null,
    email: null,
    phone,
    address: null,
    notes: null,
    isActive: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  } satisfies Customer);
}

function seedInvoice(id: string, customerId: string, total: number): void {
  store.invoices.set(id, {
    id,
    businessId: BUSINESS_ID,
    customerId,
    invoiceTypeId: "00000000-0000-4000-8000-000000000001",
    number: `FV-${id}`,
    issueDate: "2026-01-01",
    dueDate: null,
    subtotal: total,
    total,
    status: "pending",
    notes: null,
    voidedAt: null,
    voidedBy: null,
    voidReason: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  });
}

function seedProduct(id: string, name: string, unitCost: number, sku: string | null = null): void {
  store.products.set(id, {
    id,
    businessId: BUSINESS_ID,
    name,
    sku,
    unitCost,
    active: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  } satisfies Product);
}

function seedStockIn(id: string, productId: string, quantity: number): void {
  store.inventoryMovements.set(id, {
    id,
    businessId: BUSINESS_ID,
    productId,
    type: "in",
    typeId: "00000000-0000-4000-8000-000000000010",
    quantity,
    note: null,
    createdAt: "2026-01-01T00:00:00.000Z",
  } satisfies InventoryMovement);
}

function seedEmployee(id: string, name: string, baseSalary: number): void {
  store.employees.set(id, {
    id,
    businessId: BUSINESS_ID,
    name,
    baseSalary,
    active: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  } satisfies Employee);
}

// ---------------------------------------------------------------------------
// Customers — `balance` is derived (relocated sort)
// ---------------------------------------------------------------------------

describe("mock customerRepo.list sorting", () => {
  beforeEach(() => {
    seedCustomer("a", "Zulema", "300");
    seedCustomer("b", "Ana", null);
    seedCustomer("c", "Mateo", "100");
    // Balances: a = 5000, b = 30000, c = 100
    seedInvoice("i1", "a", 5000);
    seedInvoice("i2", "b", 30000);
    seedInvoice("i3", "c", 100);
  });

  it("defaults to name ascending, unchanged from before column sorting", async () => {
    const repo = createCustomerRepository(store);
    expect(ids(await repo.list(BUSINESS_ID, { ...PAGE }))).toEqual(["b", "c", "a"]);
  });

  it("sorts by the DERIVED balance column, proving the sort runs after the balance map", async () => {
    const repo = createCustomerRepository(store);

    expect(ids(await repo.list(BUSINESS_ID, { ...PAGE, sortBy: "balance", sortDir: "desc" }))).toEqual([
      "b",
      "a",
      "c",
    ]);
    expect(ids(await repo.list(BUSINESS_ID, { ...PAGE, sortBy: "balance", sortDir: "asc" }))).toEqual([
      "c",
      "a",
      "b",
    ]);
  });

  it("puts customers without a phone last in both directions", async () => {
    const repo = createCustomerRepository(store);

    expect(ids(await repo.list(BUSINESS_ID, { ...PAGE, sortBy: "phone", sortDir: "asc" }))).toEqual([
      "c",
      "a",
      "b",
    ]);
    expect(ids(await repo.list(BUSINESS_ID, { ...PAGE, sortBy: "phone", sortDir: "desc" }))).toEqual([
      "a",
      "c",
      "b",
    ]);
  });

  it("applies the sort AFTER filtering, so it orders only the matching rows", async () => {
    const repo = createCustomerRepository(store);
    const result = await repo.list(BUSINESS_ID, { ...PAGE, q: "e", sortBy: "name", sortDir: "desc" });

    // "Zulema" and "Mateo" contain an "e"; "Ana" does not. `total` counts the
    // filtered set, so the sort never reorders rows the filter excluded.
    expect(ids(result)).toEqual(["a", "c"]);
    expect(result.total).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Products — `currentQuantity` / `totalValue` are derived (relocated sort)
// ---------------------------------------------------------------------------

describe("mock productRepo.list sorting", () => {
  beforeEach(() => {
    seedProduct("a", "Tornillo", 100, "SKU-10");
    seedProduct("b", "Arandela", 5000, null);
    seedProduct("c", "Clavo", 300, "SKU-2");
    seedStockIn("m1", "a", 50); // totalValue 5000
    seedStockIn("m2", "b", 1); //  totalValue 5000 -> ties with a, broken by id
    seedStockIn("m3", "c", 10); // totalValue 3000
  });

  it("defaults to name ascending, unchanged from before column sorting", async () => {
    const repo = createProductRepository(store);
    expect(ids(await repo.list(BUSINESS_ID, { ...PAGE }))).toEqual(["b", "c", "a"]);
  });

  it("sorts by the DERIVED currentQuantity, proving the sort runs after the stock map", async () => {
    const repo = createProductRepository(store);

    expect(ids(await repo.list(BUSINESS_ID, { ...PAGE, sortBy: "currentQuantity", sortDir: "desc" }))).toEqual([
      "a",
      "c",
      "b",
    ]);
  });

  it("breaks a totalValue tie deterministically by id", async () => {
    const repo = createProductRepository(store);

    // a and b both total 5000; the id tie-break keeps the order stable so
    // `paginate` can slice the result without duplicating or dropping rows.
    expect(ids(await repo.list(BUSINESS_ID, { ...PAGE, sortBy: "totalValue", sortDir: "desc" }))).toEqual([
      "a",
      "b",
      "c",
    ]);
  });

  it("puts products without a sku last", async () => {
    const repo = createProductRepository(store);

    // Numeric collation also means SKU-2 precedes SKU-10.
    expect(ids(await repo.list(BUSINESS_ID, { ...PAGE, sortBy: "sku", sortDir: "asc" }))).toEqual([
      "c",
      "a",
      "b",
    ]);
  });
});

// ---------------------------------------------------------------------------
// Payroll payments — `employee.name` is derived (relocated sort)
// ---------------------------------------------------------------------------

describe("mock payrollPaymentRepo.list sorting", () => {
  beforeEach(() => {
    seedEmployee("e1", "Zulema", 1000);
    seedEmployee("e2", "Ana", 2000);

    const base = {
      businessId: BUSINESS_ID,
      periodType: "mensual" as const,
      periodTypeId: "00000000-0000-4000-8000-000000000020",
      periodStart: "2026-01-01",
      periodEnd: "2026-01-31",
      notes: null,
      createdAt: "2026-01-01T00:00:00.000Z",
    };
    store.payrollPayments.set("a", {
      ...base,
      id: "a",
      employeeId: "e1",
      amount: 500,
      paymentDate: "2026-02-01",
    } satisfies PayrollPayment);
    store.payrollPayments.set("b", {
      ...base,
      id: "b",
      employeeId: "e2",
      amount: 900,
      paymentDate: "2026-01-15",
    } satisfies PayrollPayment);
  });

  it("defaults to newest paymentDate first, unchanged from before column sorting", async () => {
    const repo = createPayrollRepository(store);
    expect(ids(await repo.list(BUSINESS_ID, { ...PAGE }))).toEqual(["a", "b"]);
  });

  it("sorts by the DERIVED employee name, proving the sort runs after the employee join", async () => {
    const repo = createPayrollRepository(store);

    expect(ids(await repo.list(BUSINESS_ID, { ...PAGE, sortBy: "employeeName", sortDir: "asc" }))).toEqual([
      "b",
      "a",
    ]);
    expect(ids(await repo.list(BUSINESS_ID, { ...PAGE, sortBy: "employeeName", sortDir: "desc" }))).toEqual([
      "a",
      "b",
    ]);
  });

  it("sorts by amount", async () => {
    const repo = createPayrollRepository(store);
    expect(ids(await repo.list(BUSINESS_ID, { ...PAGE, sortBy: "amount", sortDir: "desc" }))).toEqual(["b", "a"]);
  });
});

// ---------------------------------------------------------------------------
// Payments — `customer.name` / `invoice.number` denormalized on the row
// ---------------------------------------------------------------------------

describe("mock paymentRepo.list sorting", () => {
  beforeEach(() => {
    seedCustomer("c1", "Zulema");
    seedCustomer("c2", "Ana");
    seedInvoice("i1", "c1", 100_000);
    seedInvoice("i2", "c2", 100_000);

    const base = {
      businessId: BUSINESS_ID,
      methodId: null,
      notes: null,
      voidedAt: null,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    store.payments.set("a", {
      ...base,
      id: "a",
      invoiceId: "i1",
      customerId: "c1",
      paymentDate: "2026-03-01",
      amount: 100,
      method: "efectivo",
    } satisfies Payment);
    store.payments.set("b", {
      ...base,
      id: "b",
      invoiceId: "i2",
      customerId: "c2",
      paymentDate: "2026-01-01",
      amount: 900,
      method: null,
    } satisfies Payment);
  });

  it("defaults to newest paymentDate first, unchanged from before column sorting", async () => {
    const repo = createPaymentRepository(store);
    expect(ids(await repo.list(BUSINESS_ID, { ...PAGE }))).toEqual(["a", "b"]);
  });

  it("sorts by the denormalized customer name", async () => {
    const repo = createPaymentRepository(store);
    expect(ids(await repo.list(BUSINESS_ID, { ...PAGE, sortBy: "customerName", sortDir: "asc" }))).toEqual([
      "b",
      "a",
    ]);
  });

  it("puts payments without a method last", async () => {
    const repo = createPaymentRepository(store);
    expect(ids(await repo.list(BUSINESS_ID, { ...PAGE, sortBy: "method", sortDir: "asc" }))).toEqual(["a", "b"]);
  });
});

// ---------------------------------------------------------------------------
// Expenses and employees — no enrichment, straight column sorting
// ---------------------------------------------------------------------------

describe("mock expenseRepo.list sorting", () => {
  beforeEach(() => {
    const base = {
      businessId: BUSINESS_ID,
      categoryId: "00000000-0000-4000-8000-000000000030",
      notes: null,
      voidedAt: null,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    store.expenses.set("a", {
      ...base,
      id: "a",
      category: "otro",
      expenseDate: "2026-01-05",
      description: "Zapatos",
      amount: 900_00,
    } satisfies Expense);
    store.expenses.set("b", {
      ...base,
      id: "b",
      category: "nomina",
      expenseDate: "2026-02-05",
      description: "Arriendo",
      amount: 10_000_00,
    } satisfies Expense);
  });

  it("defaults to newest expenseDate first, unchanged from before column sorting", async () => {
    const repo = createExpenseRepository(store);
    expect(ids(await repo.list(BUSINESS_ID, { ...PAGE }))).toEqual(["b", "a"]);
  });

  it("sorts by description and by amount", async () => {
    const repo = createExpenseRepository(store);

    expect(ids(await repo.list(BUSINESS_ID, { ...PAGE, sortBy: "description", sortDir: "asc" }))).toEqual([
      "b",
      "a",
    ]);
    // Money is integer COP cents, so this is numeric, not lexicographic.
    expect(ids(await repo.list(BUSINESS_ID, { ...PAGE, sortBy: "amount", sortDir: "asc" }))).toEqual(["a", "b"]);
  });
});

describe("mock employeeRepo.list sorting", () => {
  beforeEach(() => {
    seedEmployee("a", "Zulema", 1_000_00);
    seedEmployee("b", "Ana", 9_000_00);
  });

  it("defaults to name ascending, unchanged from before column sorting", async () => {
    const repo = createEmployeeRepository(store);
    expect(ids(await repo.list(BUSINESS_ID, { ...PAGE }))).toEqual(["b", "a"]);
  });

  it("sorts by base salary", async () => {
    const repo = createEmployeeRepository(store);
    expect(ids(await repo.list(BUSINESS_ID, { ...PAGE, sortBy: "baseSalary", sortDir: "desc" }))).toEqual([
      "b",
      "a",
    ]);
  });
});
