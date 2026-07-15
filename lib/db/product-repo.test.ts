import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Mirrors `lib/db/employee-repo.test.ts`'s mocking pattern: `sql` is a Neon
 * tagged-template function, mocked as `vi.fn()` with controlled resolved
 * values — no real Postgres connection is made. Extended with an
 * INTEGRATION-level proof that this repo correctly fetches ALL business
 * movements once and groups them per product (mirrors `invoice-repo.list`'s
 * payment aggregation) before delegating to the shared `computeProductStock`
 * (`lib/services/inventory-stock.ts`). The pure low-stock boundary math
 * itself is NOT re-tested here — see `lib/services/inventory-stock.test.ts`,
 * the single source of truth for that coverage (also relied on by
 * `lib/mock/product-repo.test.ts`, keeping both repos' test files
 * symmetrically thin).
 */
const { mockSql } = vi.hoisted(() => ({
  mockSql: vi.fn(),
}));

vi.mock("./client", () => ({
  sql: mockSql,
  isDbConfigured: true,
}));

const { productRepo } = await import("./product-repo");

const BUSINESS_ID = "10000000-0000-4000-8000-000000000001";
const OTHER_BUSINESS_ID = "10000000-0000-4000-8000-000000000099";
const PRODUCT_ID = "90000000-0000-4000-8000-000000000001";

function productRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: PRODUCT_ID,
    business_id: BUSINESS_ID,
    name: "Shampoo Profesional",
    sku: "SHP-001",
    unit_cost: 25000,
    active: true,
    created_at: "2026-07-01T00:00:00.000Z",
    updated_at: "2026-07-01T00:00:00.000Z",
    ...overrides,
  };
}

function movementRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "a0000000-0000-4000-8000-000000000001",
    product_id: PRODUCT_ID,
    type: "in",
    quantity: 10,
    ...overrides,
  };
}

describe("db productRepo.getById", () => {
  beforeEach(() => {
    mockSql.mockReset();
  });

  it("maps a row to ProductWithStock, computing quantity/value from movements", async () => {
    mockSql
      .mockResolvedValueOnce([productRow()])
      .mockResolvedValueOnce([
        movementRow({ type: "in", quantity: 10 }),
        movementRow({ id: "a0000000-0000-4000-8000-000000000002", type: "in", quantity: 5 }),
        movementRow({ id: "a0000000-0000-4000-8000-000000000003", type: "in", quantity: 3 }),
        movementRow({ id: "a0000000-0000-4000-8000-000000000004", type: "out", quantity: 4 }),
        movementRow({ id: "a0000000-0000-4000-8000-000000000005", type: "out", quantity: 2 }),
      ]);

    const product = await productRepo.getById(BUSINESS_ID, PRODUCT_ID);

    expect(product).not.toBeNull();
    expect(product!.currentQuantity).toBe(12); // 10 + 5 + 3 - 4 - 2
    expect(product!.totalValue).toBe(12 * 25000);
    expect(product!.isLowStock).toBe(false); // 12 is above the fixed 1-3 low-stock range
  });

  it("returns null (not a leaked record) when the row belongs to a different business", async () => {
    mockSql.mockResolvedValueOnce([productRow({ business_id: OTHER_BUSINESS_ID })]);

    const product = await productRepo.getById(BUSINESS_ID, PRODUCT_ID);

    expect(product).toBeNull();
  });

  it("returns null when no row is found", async () => {
    mockSql.mockResolvedValueOnce([]);

    const product = await productRepo.getById(BUSINESS_ID, "00000000-0000-4000-8000-000000000000");

    expect(product).toBeNull();
  });

});

describe("db productRepo.list", () => {
  beforeEach(() => {
    mockSql.mockReset();
  });

  it("scopes both the products and movements fetch to businessId, computing stock per product", async () => {
    mockSql
      .mockResolvedValueOnce([productRow({ name: "Zeta" }), productRow({ id: "90000000-0000-4000-8000-000000000002", name: "Alfa" })])
      .mockResolvedValueOnce([movementRow({ product_id: PRODUCT_ID, type: "in", quantity: 5 })]);

    const result = await productRepo.list(BUSINESS_ID, { page: 1, pageSize: 20 });

    expect(result.total).toBe(2);
    expect(result.data.map((p) => p.name)).toEqual(["Alfa", "Zeta"]);
    const zeta = result.data.find((p) => p.name === "Zeta")!;
    expect(zeta.currentQuantity).toBe(5);

    const [, ...productsValues] = mockSql.mock.calls[0]!;
    expect(productsValues).toEqual([BUSINESS_ID]);
    const [, ...movementsValues] = mockSql.mock.calls[1]!;
    expect(movementsValues).toEqual([BUSINESS_ID]);
  });

  it("computes isLowStock from each product's OWN grouped movements independently (the fixed 1-3 rule) when grouping the single business-wide movements fetch", async () => {
    const PRODUCT_ID_B = "90000000-0000-4000-8000-000000000002";
    mockSql
      .mockResolvedValueOnce([productRow({ name: "A" }), productRow({ id: PRODUCT_ID_B, name: "B" })])
      .mockResolvedValueOnce([
        movementRow({ product_id: PRODUCT_ID, type: "in", quantity: 2 }), // within 1-3 -> low
        movementRow({ id: "a0000000-0000-4000-8000-000000000002", product_id: PRODUCT_ID_B, type: "in", quantity: 8 }), // above 3 -> not low
      ]);

    const result = await productRepo.list(BUSINESS_ID, { page: 1, pageSize: 20 });

    const productA = result.data.find((p) => p.name === "A")!;
    const productB = result.data.find((p) => p.name === "B")!;
    expect(productA.isLowStock).toBe(true);
    expect(productB.isLowStock).toBe(false);
  });
});

describe("db productRepo.create", () => {
  beforeEach(() => {
    mockSql.mockReset();
  });

  it("inserts via INSERT ... RETURNING * with active hardcoded true, and maps the returned row", async () => {
    mockSql.mockResolvedValueOnce([productRow({ name: "Nuevo Producto", sku: null, unit_cost: 5000 })]);

    const product = await productRepo.create(BUSINESS_ID, { name: "Nuevo Producto", unitCost: 5000 });

    expect(product.name).toBe("Nuevo Producto");
    expect(product.sku).toBeNull();
    expect(product.active).toBe(true);

    const [strings, ...values] = mockSql.mock.calls[0]!;
    const queryText = Array.from(strings as unknown as string[]).join("");
    expect(queryText).toContain("INSERT INTO products");
    expect(queryText).toContain("RETURNING");
    expect(values).toEqual([BUSINESS_ID, "Nuevo Producto", null, 5000]);
  });
});

describe("db productRepo.update", () => {
  beforeEach(() => {
    mockSql.mockReset();
  });

  it("applies name/sku/unitCost/active updates", async () => {
    mockSql
      .mockResolvedValueOnce([productRow()])
      .mockResolvedValueOnce([productRow({ name: "Actualizado", unit_cost: 30000, active: false })]);

    const updated = await productRepo.update(BUSINESS_ID, PRODUCT_ID, { name: "Actualizado", unitCost: 30000, active: false });

    expect(updated).not.toBeNull();
    expect(updated!.name).toBe("Actualizado");
    expect(updated!.unitCost).toBe(30000);
    expect(updated!.active).toBe(false);
  });

  it("returns null for a cross-business update attempt without issuing an UPDATE", async () => {
    mockSql.mockResolvedValueOnce([productRow({ business_id: OTHER_BUSINESS_ID })]);

    const result = await productRepo.update(BUSINESS_ID, PRODUCT_ID, { name: "Hijacked" });

    expect(result).toBeNull();
    expect(mockSql).toHaveBeenCalledTimes(1); // only the SELECT, no UPDATE issued
  });
});
