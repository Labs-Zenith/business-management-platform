import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ProductListQuery } from "@/lib/services/ports";

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
const { mockSql, mockTx, mockRunTransaction } = vi.hoisted(() => ({
  mockSql: vi.fn(),
  mockTx: vi.fn(),
  mockRunTransaction: vi.fn(),
}));

vi.mock("./client", () => ({
  sql: mockSql,
  isDbConfigured: true,
  runTransaction: mockRunTransaction,
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

  /**
   * `stock` filters the DERIVED `currentQuantity`/`isLowStock` fields, so
   * these seed four products spanning `out_of_stock` (0), both `low_stock`
   * boundaries (1 and 3 inclusive), and a healthy `in_stock`-but-not-low
   * quantity (4) — `in_stock` is a superset that includes the low-stock ones.
   */
  const PRODUCT_ID_OUT = "90000000-0000-4000-8000-000000000010";
  const PRODUCT_ID_LOW_MIN = "90000000-0000-4000-8000-000000000011";
  const PRODUCT_ID_LOW_MAX = "90000000-0000-4000-8000-000000000012";
  const PRODUCT_ID_HEALTHY = "90000000-0000-4000-8000-000000000013";

  function seedFourStockLevels() {
    mockSql
      .mockResolvedValueOnce([
        productRow({ id: PRODUCT_ID_OUT, name: "Sin stock" }),
        productRow({ id: PRODUCT_ID_LOW_MIN, name: "Bajo minimo" }),
        productRow({ id: PRODUCT_ID_LOW_MAX, name: "Bajo maximo" }),
        productRow({ id: PRODUCT_ID_HEALTHY, name: "Saludable" }),
      ])
      .mockResolvedValueOnce([
        movementRow({ id: "a1", product_id: PRODUCT_ID_LOW_MIN, type: "in", quantity: 1 }),
        movementRow({ id: "a2", product_id: PRODUCT_ID_LOW_MAX, type: "in", quantity: 3 }),
        movementRow({ id: "a3", product_id: PRODUCT_ID_HEALTHY, type: "in", quantity: 4 }),
      ]);
  }

  it("stock=out_of_stock returns only the product with currentQuantity === 0", async () => {
    seedFourStockLevels();

    const result = await productRepo.list(BUSINESS_ID, { stock: "out_of_stock", page: 1, pageSize: 20 });

    expect(result.data.map((p) => p.name)).toEqual(["Sin stock"]);
  });

  it("stock=low_stock returns exactly the 1-and-3 boundary products, excluding out-of-stock and healthy ones", async () => {
    seedFourStockLevels();

    const result = await productRepo.list(BUSINESS_ID, { stock: "low_stock", page: 1, pageSize: 20 });

    expect(result.data.map((p) => p.name).sort()).toEqual(["Bajo maximo", "Bajo minimo"]);
  });

  it("stock=in_stock returns every product with currentQuantity > 0, including the low-stock ones", async () => {
    seedFourStockLevels();

    const result = await productRepo.list(BUSINESS_ID, { stock: "in_stock", page: 1, pageSize: 20 });

    expect(result.data.map((p) => p.name).sort()).toEqual(["Bajo maximo", "Bajo minimo", "Saludable"]);
  });

  it("ignores an unrecognized stock value instead of throwing, returning every product unfiltered", async () => {
    seedFourStockLevels();

    const result = await productRepo.list(BUSINESS_ID, {
      stock: "bogus" as unknown as ProductListQuery["stock"],
      page: 1,
      pageSize: 20,
    });

    expect(result.data).toHaveLength(4);
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

/**
 * `delete` is the repo's only transactional writer. These assert on the
 * EMITTED SQL TEXT (mirroring `lib/db/pipeline-repo.test.ts`'s `DELETE FROM
 * pipeline_cards` assertion) because the ORDER and CONTENT of the statements
 * is the contract: lock first (so a concurrent `invoice_items` insert cannot
 * make the count stale), then count references, then drop the ledger and the
 * product only if that count was zero.
 */
describe("db productRepo.delete", () => {
  beforeEach(() => {
    mockSql.mockReset();
    mockTx.mockReset();
    mockRunTransaction.mockReset();
    mockRunTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(mockTx));
  });

  function queryTextAt(callIndex: number): string {
    const [strings] = mockTx.mock.calls[callIndex]!;
    return Array.from(strings as unknown as string[]).join("");
  }

  it("runs every statement inside ONE transaction, in lock → count → ledger → product order", async () => {
    mockTx
      .mockResolvedValueOnce([{ id: PRODUCT_ID }]) // FOR UPDATE lock
      .mockResolvedValueOnce([{ invoice_count: 0 }]) // reference count
      .mockResolvedValueOnce([]) // DELETE inventory_movements
      .mockResolvedValueOnce([]); // DELETE products

    const result = await productRepo.delete(BUSINESS_ID, PRODUCT_ID);

    expect(result).toEqual({ outcome: "deleted" });
    expect(mockRunTransaction).toHaveBeenCalledTimes(1);
    expect(mockTx).toHaveBeenCalledTimes(4);
    expect(queryTextAt(0)).toContain("FOR UPDATE");
    expect(queryTextAt(0)).toContain("FROM products");
    // `invoice_items` has no business_id of its own, hence the join.
    expect(queryTextAt(1)).toContain("COUNT(DISTINCT ii.invoice_id)");
    expect(queryTextAt(1)).toContain("JOIN invoices");
    expect(queryTextAt(2)).toContain("DELETE FROM inventory_movements");
    expect(queryTextAt(3)).toContain("DELETE FROM products");
  });

  it("scopes the lock to the requesting business", async () => {
    mockTx
      .mockResolvedValueOnce([{ id: PRODUCT_ID }])
      .mockResolvedValueOnce([{ invoice_count: 0 }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    await productRepo.delete(BUSINESS_ID, PRODUCT_ID);

    const [, ...values] = mockTx.mock.calls[0]!;
    expect(values).toContain(BUSINESS_ID);
    expect(values).toContain(PRODUCT_ID);
  });

  it("refuses with the invoice count and issues NO mutation once the product has been sold", async () => {
    mockTx
      .mockResolvedValueOnce([{ id: PRODUCT_ID }])
      .mockResolvedValueOnce([{ invoice_count: 3 }]);

    const result = await productRepo.delete(BUSINESS_ID, PRODUCT_ID);

    expect(result).toEqual({ outcome: "conflict", invoiceCount: 3 });
    // Lock + count only: no DELETE was ever issued.
    expect(mockTx).toHaveBeenCalledTimes(2);
  });

  it("coerces a string count from the driver to a number", async () => {
    mockTx
      .mockResolvedValueOnce([{ id: PRODUCT_ID }])
      .mockResolvedValueOnce([{ invoice_count: "1" }]);

    const result = await productRepo.delete(BUSINESS_ID, PRODUCT_ID);

    expect(result).toEqual({ outcome: "conflict", invoiceCount: 1 });
  });

  it("returns not_found and issues NO mutation when the lock finds nothing (unknown or cross-business id)", async () => {
    mockTx.mockResolvedValueOnce([]);

    const result = await productRepo.delete(OTHER_BUSINESS_ID, PRODUCT_ID);

    expect(result).toEqual({ outcome: "not_found" });
    expect(mockTx).toHaveBeenCalledTimes(1); // only the lock — nothing was deleted
  });
});
