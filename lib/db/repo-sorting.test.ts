import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Column sorting for the Postgres backend. The paired mock coverage is
 * `lib/mock/repo-sorting.test.ts`; this file exists because the two backends
 * are independent implementations that must agree, and because THIS is the one
 * that runs in production.
 *
 * Scope is deliberately narrow: the repositories whose sortable columns are
 * DERIVED by an enrichment map inside `list` (`balance`, `currentQuantity` /
 * `totalValue`, `employee.name`, and the computed invoice `status`). Those
 * repos used to sort BEFORE that map, so these assertions are what prove the
 * sort was relocated after it. The comparator semantics themselves are covered
 * once, at the unit level, in `lib/services/sorting.test.ts`.
 *
 * `sql` is mocked as a tagged-template `vi.fn()` with per-call resolved values
 * — no real Postgres connection — following `lib/db/product-repo.test.ts`.
 */
const { mockSql } = vi.hoisted(() => ({ mockSql: vi.fn() }));

vi.mock("./client", () => ({
  sql: mockSql,
  isDbConfigured: true,
  runTransaction: vi.fn(),
}));

const { customerRepo } = await import("./customer-repo");
const { productRepo } = await import("./product-repo");
const { payrollRepo } = await import("./payroll-repo");
const { invoiceRepo } = await import("./invoice-repo");

const BUSINESS_ID = "10000000-0000-4000-8000-000000000001";
const PAGE = { page: 1, pageSize: 20 };
const TS = "2026-01-01T00:00:00.000Z";

const ids = (result: { data: Array<{ id: string }> }) => result.data.map((row) => row.id);

beforeEach(() => {
  mockSql.mockReset();
});

describe("customerRepo.list sorting", () => {
  // `list` issues three queries in order: customers, invoices, payments.
  function seed() {
    mockSql
      .mockResolvedValueOnce([
        { id: "a", business_id: BUSINESS_ID, name: "Zulema", document_number: null, email: null, phone: "300", address: null, notes: null, is_active: true, created_at: TS, updated_at: TS },
        { id: "b", business_id: BUSINESS_ID, name: "Ana", document_number: null, email: null, phone: null, address: null, notes: null, is_active: true, created_at: TS, updated_at: TS },
        { id: "c", business_id: BUSINESS_ID, name: "Mateo", document_number: null, email: null, phone: "100", address: null, notes: null, is_active: true, created_at: TS, updated_at: TS },
      ])
      // Balances: a = 5000, b = 30000, c = 100
      .mockResolvedValueOnce([
        { customer_id: "a", total: 5000 },
        { customer_id: "b", total: 30000 },
        { customer_id: "c", total: 100 },
      ])
      .mockResolvedValueOnce([]);
  }

  it("defaults to name ascending, unchanged from before column sorting", async () => {
    seed();
    expect(ids(await customerRepo.list(BUSINESS_ID, { ...PAGE }))).toEqual(["b", "c", "a"]);
  });

  it("sorts by the DERIVED balance column, proving the sort runs after the balance map", async () => {
    seed();
    expect(ids(await customerRepo.list(BUSINESS_ID, { ...PAGE, sortBy: "balance", sortDir: "desc" }))).toEqual([
      "b",
      "a",
      "c",
    ]);
  });

  it("puts customers without a phone last regardless of direction", async () => {
    seed();
    expect(ids(await customerRepo.list(BUSINESS_ID, { ...PAGE, sortBy: "phone", sortDir: "desc" }))).toEqual([
      "a",
      "c",
      "b",
    ]);
  });
});

describe("productRepo.list sorting", () => {
  // `list` issues two queries in order: products, inventory_movements.
  function seed() {
    mockSql
      .mockResolvedValueOnce([
        { id: "a", business_id: BUSINESS_ID, name: "Tornillo", sku: "SKU-10", unit_cost: 100, active: true, created_at: TS, updated_at: TS },
        { id: "b", business_id: BUSINESS_ID, name: "Arandela", sku: null, unit_cost: 5000, active: true, created_at: TS, updated_at: TS },
        { id: "c", business_id: BUSINESS_ID, name: "Clavo", sku: "SKU-2", unit_cost: 300, active: true, created_at: TS, updated_at: TS },
      ])
      .mockResolvedValueOnce([
        { id: "m1", product_id: "a", type: "in", quantity: 50 },
        { id: "m2", product_id: "b", type: "in", quantity: 1 },
        { id: "m3", product_id: "c", type: "in", quantity: 10 },
      ]);
  }

  it("defaults to name ascending, unchanged from before column sorting", async () => {
    seed();
    expect(ids(await productRepo.list(BUSINESS_ID, { ...PAGE }))).toEqual(["b", "c", "a"]);
  });

  it("sorts by the DERIVED currentQuantity, proving the sort runs after the stock map", async () => {
    seed();
    expect(ids(await productRepo.list(BUSINESS_ID, { ...PAGE, sortBy: "currentQuantity", sortDir: "desc" }))).toEqual(
      ["a", "c", "b"],
    );
  });

  it("sorts by the DERIVED totalValue, breaking the a/b tie by id", async () => {
    seed();
    // a = 50 x 100 = 5000, b = 1 x 5000 = 5000, c = 10 x 300 = 3000.
    expect(ids(await productRepo.list(BUSINESS_ID, { ...PAGE, sortBy: "totalValue", sortDir: "desc" }))).toEqual([
      "a",
      "b",
      "c",
    ]);
  });

  it("orders sku with numeric collation and sends the null last", async () => {
    seed();
    expect(ids(await productRepo.list(BUSINESS_ID, { ...PAGE, sortBy: "sku", sortDir: "asc" }))).toEqual([
      "c",
      "a",
      "b",
    ]);
  });
});

describe("payrollRepo.list sorting", () => {
  // `list` issues two queries in order: payroll_payments, employees.
  function seed() {
    const base = {
      business_id: BUSINESS_ID,
      period_type: "mensual",
      period_type_id: "00000000-0000-4000-8000-000000000020",
      period_start: "2026-01-01",
      period_end: "2026-01-31",
      notes: null,
      created_at: TS,
    };
    mockSql
      .mockResolvedValueOnce([
        { ...base, id: "a", employee_id: "e1", amount: 500, payment_date: "2026-02-01" },
        { ...base, id: "b", employee_id: "e2", amount: 900, payment_date: "2026-01-15" },
      ])
      .mockResolvedValueOnce([
        { id: "e1", name: "Zulema" },
        { id: "e2", name: "Ana" },
      ]);
  }

  it("defaults to newest paymentDate first, unchanged from before column sorting", async () => {
    seed();
    expect(ids(await payrollRepo.list(BUSINESS_ID, { ...PAGE }))).toEqual(["a", "b"]);
  });

  it("sorts by the DERIVED employee name, proving the sort runs after the employee join", async () => {
    seed();
    expect(ids(await payrollRepo.list(BUSINESS_ID, { ...PAGE, sortBy: "employeeName", sortDir: "asc" }))).toEqual([
      "b",
      "a",
    ]);
  });
});

describe("invoiceRepo.list sorting", () => {
  // `status` is COMPUTED per request via `computeStatus(..., new Date())`, so
  // an invoice migrates pending -> overdue as its due date passes. The clock
  // is pinned here or this suite would order differently depending on the day
  // it runs.
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-01T12:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // `list` issues two queries in order: invoices, payments.
  function seed() {
    const base = {
      business_id: BUSINESS_ID,
      customer_id: "c1",
      invoice_type_id: "00000000-0000-4000-8000-000000000001",
      subtotal: 0,
      status: "pending",
      notes: null,
      created_at: TS,
      updated_at: TS,
    };
    mockSql
      .mockResolvedValueOnce([
        { ...base, id: "a", number: "FV-2", issue_date: "2026-01-01", due_date: null, total: 1000 },
        { ...base, id: "b", number: "FV-10", issue_date: "2026-03-01", due_date: "2026-04-01", total: 300 },
        { ...base, id: "c", number: "FV-1", issue_date: "2026-02-01", due_date: "2026-03-01", total: 2000 },
      ])
      // 300 paid against b, which fully settles it -> status "paid".
      .mockResolvedValueOnce([{ id: "p1", invoice_id: "b", amount: 300 }]);
  }

  it("defaults to newest issueDate first, unchanged from before column sorting", async () => {
    seed();
    expect(ids(await invoiceRepo.list(BUSINESS_ID, { ...PAGE }))).toEqual(["b", "c", "a"]);
  });

  it("orders invoice numbers numerically, so FV-2 precedes FV-10", async () => {
    seed();
    expect(ids(await invoiceRepo.list(BUSINESS_ID, { ...PAGE, sortBy: "number", sortDir: "asc" }))).toEqual([
      "c",
      "a",
      "b",
    ]);
  });

  it("sorts by the DERIVED balance", async () => {
    seed();
    // a = 1000, b = 0 (fully paid), c = 2000.
    expect(ids(await invoiceRepo.list(BUSINESS_ID, { ...PAGE, sortBy: "balance", sortDir: "desc" }))).toEqual([
      "c",
      "a",
      "b",
    ]);
  });

  it("sorts by the COMPUTED status, most urgent first", async () => {
    seed();
    // At the pinned 2026-05-01: c is unpaid past its 2026-03-01 due date ->
    // overdue; a has no due date -> pending; b is fully paid -> paid. The
    // severity ranking is what makes ascending useful to a user.
    expect(ids(await invoiceRepo.list(BUSINESS_ID, { ...PAGE, sortBy: "status", sortDir: "asc" }))).toEqual([
      "c",
      "a",
      "b",
    ]);
  });

  it("puts invoices without a due date last in both directions", async () => {
    seed();
    expect(ids(await invoiceRepo.list(BUSINESS_ID, { ...PAGE, sortBy: "dueDate", sortDir: "asc" }))).toEqual([
      "c",
      "b",
      "a",
    ]);
    seed();
    expect(ids(await invoiceRepo.list(BUSINESS_ID, { ...PAGE, sortBy: "dueDate", sortDir: "desc" }))).toEqual([
      "b",
      "c",
      "a",
    ]);
  });
});
