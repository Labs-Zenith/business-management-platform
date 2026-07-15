import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Mirrors `lib/db/employee-repo.test.ts`'s mocking pattern: `sql` is a
 * Neon tagged-template function, mocked as `vi.fn()` with controlled
 * resolved values — no real Postgres connection is made. Every catalog
 * lookup is a single, unfiltered, business-agnostic `SELECT * FROM <table>`.
 */
const { mockSql } = vi.hoisted(() => ({
  mockSql: vi.fn(),
}));

vi.mock("./client", () => ({
  sql: mockSql,
  isDbConfigured: true,
}));

const { catalogRepo } = await import("./catalog-repo");

function invoiceTypeRow(overrides: Partial<Record<string, unknown>> = {}) {
  return { id: "c1000000-0000-4000-8000-000000000001", code: "venta", label: "Factura de venta", prefix: "FAC", active: true, ...overrides };
}

function catalogRow(overrides: Partial<Record<string, unknown>> = {}) {
  return { id: "c2000000-0000-4000-8000-000000000001", code: "otro", label: "Otro", active: true, ...overrides };
}

describe("db catalogRepo", () => {
  beforeEach(() => {
    mockSql.mockReset();
  });

  it("listInvoiceTypes maps rows including prefix, via an unfiltered SELECT", async () => {
    mockSql.mockResolvedValueOnce([invoiceTypeRow()]);

    const types = await catalogRepo.listInvoiceTypes();

    expect(types).toEqual([{ id: invoiceTypeRow().id, code: "venta", label: "Factura de venta", prefix: "FAC", active: true }]);
    const [strings] = mockSql.mock.calls[0]!;
    expect(Array.from(strings as unknown as string[]).join("")).toContain("SELECT * FROM invoice_types");
  });

  it("listExpenseCategories maps rows without a prefix field", async () => {
    mockSql.mockResolvedValueOnce([catalogRow()]);

    const categories = await catalogRepo.listExpenseCategories();

    expect(categories).toEqual([{ id: catalogRow().id, code: "otro", label: "Otro", active: true }]);
  });

  it("listPaymentMethods issues an unfiltered SELECT against payment_methods", async () => {
    mockSql.mockResolvedValueOnce([catalogRow({ code: "cash", label: "Efectivo" })]);

    const methods = await catalogRepo.listPaymentMethods();

    expect(methods[0]!.code).toBe("cash");
    const [strings] = mockSql.mock.calls[0]!;
    expect(Array.from(strings as unknown as string[]).join("")).toContain("payment_methods");
  });

  it("listMovementTypes issues an unfiltered SELECT against movement_types", async () => {
    mockSql.mockResolvedValueOnce([catalogRow({ code: "in", label: "Entrada" })]);

    const types = await catalogRepo.listMovementTypes();

    expect(types[0]!.code).toBe("in");
  });

  it("listPayrollPeriodTypes issues an unfiltered SELECT against payroll_period_types", async () => {
    mockSql.mockResolvedValueOnce([catalogRow({ code: "quincenal", label: "Quincenal" })]);

    const types = await catalogRepo.listPayrollPeriodTypes();

    expect(types[0]!.code).toBe("quincenal");
  });
});
