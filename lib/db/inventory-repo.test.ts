import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Mirrors `lib/db/payroll-repo.test.ts`'s mock shape (a `vi.fn()` `sql` tag
 * PLUS a mocked `runTransaction`), because `create` now runs a TWO-STATEMENT
 * body inside `runTransaction(async (tx) => {...})` (postgres.js's
 * interactive `sql.begin`) — statement 1 `SELECT … FOR UPDATE` locks the
 * product row, statement 2 is the SUM guard + conditional INSERT (see the
 * repo's file-level doc comment for why the single-statement CTE was
 * race-buggy). The critical assertions are that `create` (a) runs BOTH
 * statements sequentially against the SAME `tx`, in lock-then-insert order,
 * with the correct text and interpolated values for each, (b) surfaces an
 * empty statement-1 result as NOT_FOUND, and (c) surfaces a non-empty
 * statement-1 result with an empty statement-2 `RETURNING` as the
 * floor-at-zero `VALIDATION_ERROR`, not a fabricated success.
 */
const { mockSql, mockTx, mockRunTransaction } = vi.hoisted(() => {
  const sqlFn = vi.fn();
  const txFn = vi.fn();
  const runTransactionFn = vi.fn();
  return { mockSql: sqlFn, mockTx: txFn, mockRunTransaction: runTransactionFn };
});

vi.mock("./client", () => ({
  sql: mockSql,
  isDbConfigured: true,
  runTransaction: mockRunTransaction,
}));

const { inventoryRepo } = await import("./inventory-repo");

const BUSINESS_ID = "10000000-0000-4000-8000-000000000001";
const OTHER_BUSINESS_ID = "10000000-0000-4000-8000-000000000099";
const PRODUCT_ID = "90000000-0000-4000-8000-000000000001";

function movementRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "a0000000-0000-4000-8000-000000000001",
    business_id: BUSINESS_ID,
    product_id: PRODUCT_ID,
    type: "in",
    quantity: 5,
    note: null,
    created_at: "2026-07-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("db inventoryRepo.create — floor-at-zero guard (safety-critical)", () => {
  beforeEach(() => {
    mockSql.mockReset();
    mockTx.mockReset();
    mockRunTransaction.mockReset();
    mockRunTransaction.mockImplementation((fn: (tx: typeof mockTx) => Promise<unknown>) => fn(mockTx));
  });

  it("throws NOT_FOUND when statement 1 (FOR UPDATE lock) matches no product row, and inserts nothing", async () => {
    // Statement 1 empty (product not found for this business) => statement 2
    // also inserts nothing (its CTE is scoped to the same id + business_id).
    mockTx.mockResolvedValueOnce([]).mockResolvedValueOnce([]);

    await expect(
      inventoryRepo.create(BUSINESS_ID, { productId: PRODUCT_ID, type: "in", quantity: 5 }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    // Both statements are still run inside ONE transaction callback (the
    // empty transaction commits with zero mutation); NOT_FOUND is decided
    // from statement 1's empty result, not a separate pre-check round trip.
    expect(mockRunTransaction).toHaveBeenCalledTimes(1);
    expect(mockTx).toHaveBeenCalledTimes(2);
  });

  it("runs BOTH statements sequentially inside ONE runTransaction callback — statement 1 SELECT … FOR UPDATE (lock) then statement 2 SUM guard + INSERT — with correct text and interpolated values", async () => {
    mockTx.mockResolvedValueOnce([{ id: PRODUCT_ID }]).mockResolvedValueOnce([movementRow({ type: "out", quantity: 5 })]);

    const movement = await inventoryRepo.create(BUSINESS_ID, { productId: PRODUCT_ID, type: "out", quantity: 5 });

    expect(movement.id).toBe("a0000000-0000-4000-8000-000000000001");

    // Statement 1: locks the product row, scoped to id + business_id.
    const [lockStrings, ...lockValues] = mockTx.mock.calls[0]!;
    const lockText = Array.from(lockStrings as unknown as string[]).join("");
    expect(lockText).toContain("SELECT id FROM products");
    expect(lockText).toContain("FOR UPDATE");
    expect(lockText).not.toContain("INSERT"); // the lock statement never writes
    expect(lockValues).toEqual([PRODUCT_ID, BUSINESS_ID]);

    // Statement 2: SUM guard + conditional INSERT, and — critically — it does
    // NOT re-take a `FOR UPDATE` (statement 1 is the sole lock holder; see the
    // repo doc comment on the EvalPlanQual stale-subquery hazard).
    const [insStrings, ...insValues] = mockTx.mock.calls[1]!;
    const insText = Array.from(insStrings as unknown as string[]).join("");
    expect(insText).toContain("INSERT INTO inventory_movements");
    expect(insText).toContain("RETURNING");
    expect(insText).toContain("current_qty");
    expect(insText).toContain("<= bal.current_qty");
    expect(insText).toMatch(/=\s*'in'\s*OR/);
    expect(insText).not.toContain("FOR UPDATE");
    // Statement 2 values, in template order: productId+businessId (CTE WHERE),
    // then businessId+type+[typeId COALESCE: explicit-id(null)+code-subquery]
    // +quantity+note (INSERT…SELECT), then type+quantity again (floor-at-zero
    // WHERE).
    expect(insValues).toEqual([PRODUCT_ID, BUSINESS_ID, BUSINESS_ID, "out", null, "out", 5, null, "out", 5]);

    // Exactly ONE transaction callback, running exactly those two statements
    // in lock-then-insert order — proving both run in one atomic
    // transaction, not as two separate un-transacted round trips.
    expect(mockRunTransaction).toHaveBeenCalledTimes(1);
    expect(mockTx).toHaveBeenCalledTimes(2);
  });

  it("throws VALIDATION_ERROR (not NOT_FOUND) when statement 1 found the product but statement 2's RETURNING is empty (floor-at-zero rejected the insert, zero mutation)", async () => {
    // Product exists (statement 1 non-empty) but the out-movement doesn't fit:
    // statement 2's WHERE excluded the row -> empty RETURNING.
    mockTx.mockResolvedValueOnce([{ id: PRODUCT_ID }]).mockResolvedValueOnce([]);

    await expect(
      inventoryRepo.create(BUSINESS_ID, { productId: PRODUCT_ID, type: "out", quantity: 999 }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });

    // Exactly ONE transaction — no stray extra write attempt after the empty
    // RETURNING, and no silent retry.
    expect(mockRunTransaction).toHaveBeenCalledTimes(1);
  });

  it("stores note as null when omitted", async () => {
    mockTx.mockResolvedValueOnce([{ id: PRODUCT_ID }]).mockResolvedValueOnce([movementRow({ type: "in", note: null })]);

    const movement = await inventoryRepo.create(BUSINESS_ID, { productId: PRODUCT_ID, type: "in", quantity: 5 });

    expect(movement.note).toBeNull();
  });

  it("scopes the lock statement to businessId, rejecting a product from a different business as NOT_FOUND", async () => {
    // AND business_id = businessId excludes the other-business row from BOTH
    // statements.
    mockTx.mockResolvedValueOnce([]).mockResolvedValueOnce([]);

    await expect(
      inventoryRepo.create(OTHER_BUSINESS_ID, { productId: PRODUCT_ID, type: "in", quantity: 1 }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    const [lockStrings, ...lockValues] = mockTx.mock.calls[0]!;
    const lockText = Array.from(lockStrings as unknown as string[]).join("");
    expect(lockText).toContain("business_id");
    expect(lockValues).toEqual([PRODUCT_ID, OTHER_BUSINESS_ID]);
  });

  it("propagates the error and fabricates nothing when the transaction rejects", async () => {
    mockRunTransaction.mockRejectedValueOnce(new Error("simulated transaction failure"));

    await expect(
      inventoryRepo.create(BUSINESS_ID, { productId: PRODUCT_ID, type: "out", quantity: 5 }),
    ).rejects.toThrow("simulated transaction failure");
  });
});

describe("db inventoryRepo.getById/list — business_id scoping", () => {
  beforeEach(() => {
    mockSql.mockReset();
    mockTx.mockReset();
    mockRunTransaction.mockReset();
  });

  it("returns the movement with the joined product name when it belongs to the requesting business", async () => {
    mockSql.mockResolvedValueOnce([movementRow()]).mockResolvedValueOnce([{ id: PRODUCT_ID, name: "Producto de prueba" }]);

    const found = await inventoryRepo.getById(BUSINESS_ID, "a0000000-0000-4000-8000-000000000001");

    expect(found).not.toBeNull();
    expect(found!.product.name).toBe("Producto de prueba");
  });

  it("returns null (not a leaked record) when the row belongs to a different business", async () => {
    mockSql.mockResolvedValueOnce([movementRow({ business_id: OTHER_BUSINESS_ID })]);

    const found = await inventoryRepo.getById(BUSINESS_ID, "a0000000-0000-4000-8000-000000000001");

    expect(found).toBeNull();
  });

  it("list scopes the fetch to businessId and filters by type in JS", async () => {
    mockSql
      .mockResolvedValueOnce([movementRow({ type: "in" }), movementRow({ id: "a0000000-0000-4000-8000-000000000002", type: "out" })])
      .mockResolvedValueOnce([{ id: PRODUCT_ID, name: "Producto de prueba" }]);

    const result = await inventoryRepo.list(BUSINESS_ID, { page: 1, pageSize: 20, type: "out" });

    expect(result.data).toHaveLength(1);
    expect(result.data[0]!.type).toBe("out");

    const [, ...values] = mockSql.mock.calls[0]!;
    expect(values).toEqual([BUSINESS_ID]);
  });
});
