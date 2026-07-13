import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Mirrors `lib/db/inventory-repo.test.ts`'s mock shape (a `vi.fn()` `sql` tag
 * PLUS a mocked `sql.transaction`), because `update` now runs a SINGLE
 * `sql.transaction([...])` containing EVERY mutating statement:
 *   [0] `SELECT ... FOR UPDATE` locks the invoice row,
 *   [1] the fresh `NOT EXISTS(payments)` guard + conditional header `UPDATE`,
 *   [2] a guarded wholesale item `DELETE`,
 *   [3..N] one guarded `INSERT ... SELECT ... WHERE EXISTS(...)` per item.
 *
 * The item DELETE/INSERTs are NO LONGER separate, un-transacted round trips
 * (the pre-fix bug: a header committed with new totals while a later item
 * INSERT failed left a persisted invoice whose totals didn't match its items).
 * Every statement carries the SAME "business_id matches AND NOT
 * EXISTS(payments)" guard so a payment-locked/cross-business edit mutates
 * NOTHING even though a non-interactive transaction runs all statements.
 *
 * Critical assertions: `update` (a) hands ALL statements to
 * `sql.transaction([...])` in ONE call, lock-then-update-then-delete-then-
 * insert order, (b) interpolates the correct VALUES (not just text) into every
 * statement, (c) surfaces an empty statement-1 result as `null`
 * (missing/cross-business), (d) surfaces a non-empty statement-1 result with
 * an empty statement-2 `RETURNING` as the payment-locked `CONFLICT`.
 */
const { mockSql } = vi.hoisted(() => {
  const fn = vi.fn();
  const withTransaction = fn as typeof fn & { transaction: ReturnType<typeof vi.fn> };
  withTransaction.transaction = vi.fn();
  return { mockSql: withTransaction };
});

vi.mock("./client", () => ({
  sql: mockSql,
  isDbConfigured: true,
  // Shared helper (Fix 6) delegates to the mocked `sql.transaction` so the
  // existing `mockSql.transaction` assertions keep working unchanged.
  runTransaction: (queries: unknown[]) =>
    (mockSql.transaction as unknown as (q: unknown[]) => Promise<unknown[]>)(queries),
}));

const { invoiceRepo } = await import("./invoice-repo");

const BUSINESS_ID = "10000000-0000-4000-8000-000000000001";
const OTHER_BUSINESS_ID = "10000000-0000-4000-8000-000000000099";
const INVOICE_ID = "50000000-0000-4000-8000-000000000001";
const CUSTOMER_ID = "40000000-0000-4000-8000-000000000001";

function invoiceRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: INVOICE_ID,
    business_id: BUSINESS_ID,
    customer_id: CUSTOMER_ID,
    number: "FAC-0001",
    issue_date: "2026-07-09",
    due_date: "2026-08-09",
    subtotal: 60000,
    total: 60000,
    status: "pending",
    notes: "actualizado",
    created_at: "2026-07-01T00:00:00.000Z",
    updated_at: "2026-07-09T00:00:00.000Z",
    ...overrides,
  };
}

function buildPersist(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    customerId: CUSTOMER_ID,
    issueDate: "2026-07-09",
    dueDate: "2026-08-09",
    items: [{ description: "Servicio editado", quantity: 2, unitPrice: 30000, lineTotal: 60000 }],
    subtotal: 60000,
    total: 60000,
    status: "pending" as const,
    notes: "actualizado",
    ...overrides,
  };
}

describe("db invoiceRepo.update — edit-lock guard (safety-critical)", () => {
  beforeEach(() => {
    mockSql.mockReset();
    mockSql.transaction.mockReset();
  });

  it("returns null (missing/cross-business, never leaked) when statement 1 (FOR UPDATE lock) matches no invoice row, and mutates nothing", async () => {
    mockSql
      .mockReturnValueOnce("LOCK_QUERY")
      .mockReturnValueOnce("UPDATE_QUERY")
      .mockReturnValueOnce("DELETE_QUERY")
      .mockReturnValueOnce("INSERT_QUERY");
    // All 4 statements run in the non-interactive transaction; the guards make
    // the UPDATE/DELETE/INSERT no-ops when the invoice doesn't match.
    mockSql.transaction.mockResolvedValueOnce([[], [], [], []]);

    const result = await invoiceRepo.update(BUSINESS_ID, INVOICE_ID, buildPersist());

    expect(result).toBeNull();
    expect(mockSql.transaction).toHaveBeenCalledTimes(1);
    const [queriesArg] = mockSql.transaction.mock.calls[0]!;
    expect(queriesArg).toEqual(["LOCK_QUERY", "UPDATE_QUERY", "DELETE_QUERY", "INSERT_QUERY"]);
    // Exactly the 4 transacted statements were built — no extra un-transacted
    // item round trip, and buildDetail is never reached on the null path.
    expect(mockSql).toHaveBeenCalledTimes(4);
  });

  it("throws CONFLICT (not NOT_FOUND, not a generic Error) when statement 1 found the invoice but statement 2's NOT EXISTS guard excluded the update — zero mutation", async () => {
    mockSql
      .mockReturnValueOnce("LOCK_QUERY")
      .mockReturnValueOnce("UPDATE_QUERY")
      .mockReturnValueOnce("DELETE_QUERY")
      .mockReturnValueOnce("INSERT_QUERY");
    // Invoice exists (statement 1 non-empty) but a payment exists -> statement
    // 2's NOT EXISTS guard excludes the row -> empty RETURNING. The guarded
    // DELETE/INSERTs in the same transaction were no-ops too.
    mockSql.transaction.mockResolvedValueOnce([[{ id: INVOICE_ID }], [], [], []]);

    const { ApiError } = await import("@/lib/server/api-error");
    const error: unknown = await invoiceRepo
      .update(BUSINESS_ID, INVOICE_ID, buildPersist())
      .catch((err: unknown) => err);

    expect(error).toMatchObject({ code: "CONFLICT" });
    expect(error).toBeInstanceOf(ApiError);

    // No mutation beyond building the single transaction's statements; no
    // buildDetail reads on the reject path.
    expect(mockSql.transaction).toHaveBeenCalledTimes(1);
    expect(mockSql).toHaveBeenCalledTimes(4);
  });

  it("hands ALL statements to sql.transaction in one call — lock, guarded header UPDATE, guarded item DELETE, guarded item INSERT — with correct text AND interpolated values", async () => {
    mockSql
      .mockReturnValueOnce("LOCK_QUERY")
      .mockReturnValueOnce("UPDATE_QUERY")
      .mockReturnValueOnce("DELETE_QUERY")
      .mockReturnValueOnce("INSERT_QUERY");
    mockSql.transaction.mockResolvedValueOnce([[{ id: INVOICE_ID }], [invoiceRow()], [], []]);
    // buildDetail's Promise.all (customer, items, payments) reads AFTER the
    // transaction resolves, to build the returned `InvoiceDetail`.
    mockSql.mockResolvedValueOnce([
      {
        id: CUSTOMER_ID,
        business_id: BUSINESS_ID,
        name: "Cliente Demo",
        document_number: null,
        email: null,
        phone: null,
        address: null,
        notes: null,
        is_active: true,
        created_at: "2026-01-01T00:00:00.000Z",
        updated_at: "2026-01-01T00:00:00.000Z",
      },
    ]); // customerRows
    mockSql.mockResolvedValueOnce([
      {
        id: "60000000-0000-4000-8000-000000000001",
        invoice_id: INVOICE_ID,
        description: "Servicio editado",
        quantity: "2",
        unit_price: 30000,
        line_total: 60000,
      },
    ]); // itemRows
    mockSql.mockResolvedValueOnce([]); // paymentRows

    const persist = buildPersist();
    const updated = await invoiceRepo.update(BUSINESS_ID, INVOICE_ID, persist);

    expect(updated).not.toBeNull();
    expect(updated!.number).toBe("FAC-0001");
    expect(updated!.total).toBe(60000);

    // --- Statement 1: locks the invoice row, scoped to id + business_id. ---
    const [lockStrings, ...lockValues] = mockSql.mock.calls[0]!;
    const lockText = Array.from(lockStrings as unknown as string[]).join("");
    expect(lockText).toContain("SELECT id FROM invoices");
    expect(lockText).toContain("FOR UPDATE");
    expect(lockText).not.toContain("UPDATE invoices SET");
    expect(lockValues).toEqual([INVOICE_ID, BUSINESS_ID]);

    // --- Statement 2: guarded header UPDATE, text AND interpolated values. ---
    const [updStrings, ...updValues] = mockSql.mock.calls[1]!;
    const updText = Array.from(updStrings as unknown as string[]).join("");
    expect(updText).toContain("UPDATE invoices SET");
    expect(updText).toContain("NOT EXISTS");
    expect(updText).toContain("RETURNING");
    expect(updText).not.toContain("FOR UPDATE");
    // `number` is never part of the SET clause — immutable.
    expect(updText).not.toMatch(/number\s*=/);
    // VALUES in SET-then-WHERE order (Fix 3 — no longer discarded).
    expect(updValues).toEqual([
      CUSTOMER_ID, // customer_id
      persist.issueDate, // issue_date
      persist.dueDate, // due_date
      persist.subtotal, // subtotal
      persist.total, // total
      persist.status, // status
      persist.notes, // notes
      INVOICE_ID, // WHERE id
      BUSINESS_ID, // WHERE business_id
    ]);

    // --- Statement 3: guarded item DELETE, text AND interpolated values. ---
    const [deleteStrings, ...deleteValues] = mockSql.mock.calls[2]!;
    const deleteText = Array.from(deleteStrings as unknown as string[]).join("");
    expect(deleteText).toContain("DELETE FROM invoice_items");
    expect(deleteText).toContain("NOT EXISTS");
    // Guard mirrors the header UPDATE: invoice_id, then the EXISTS(id,businessId).
    expect(deleteValues).toEqual([INVOICE_ID, INVOICE_ID, BUSINESS_ID]);

    // --- Statement 4: guarded item INSERT (one per item), text AND values. ---
    const [insertStrings, ...insertValues] = mockSql.mock.calls[3]!;
    const insertText = Array.from(insertStrings as unknown as string[]).join("");
    expect(insertText).toContain("INSERT INTO invoice_items");
    // Guarded INSERT ... SELECT ... WHERE EXISTS, NOT a plain VALUES, so it is
    // a no-op when the guard is false.
    expect(insertText).toContain("SELECT");
    expect(insertText).toContain("WHERE EXISTS");
    expect(insertText).not.toContain("VALUES");
    const item = persist.items[0]!;
    expect(insertValues).toEqual([
      INVOICE_ID, // SELECT ... ${id}
      item.description,
      item.quantity,
      item.unitPrice,
      item.lineTotal,
      INVOICE_ID, // EXISTS(... i.id
      BUSINESS_ID, // EXISTS(... i.business_id
    ]);

    // ONE transaction call containing all four statements, in order.
    expect(mockSql.transaction).toHaveBeenCalledTimes(1);
    const [queriesArg] = mockSql.transaction.mock.calls[0]!;
    expect(queriesArg).toEqual(["LOCK_QUERY", "UPDATE_QUERY", "DELETE_QUERY", "INSERT_QUERY"]);
  });

  it("builds one guarded INSERT statement per item, all inside the single transaction", async () => {
    mockSql
      .mockReturnValueOnce("LOCK_QUERY")
      .mockReturnValueOnce("UPDATE_QUERY")
      .mockReturnValueOnce("DELETE_QUERY")
      .mockReturnValueOnce("INSERT_1")
      .mockReturnValueOnce("INSERT_2")
      .mockReturnValueOnce("INSERT_3");
    mockSql.transaction.mockResolvedValueOnce([[{ id: INVOICE_ID }], [invoiceRow()], [], [], [], []]);
    // buildDetail reads.
    mockSql.mockResolvedValueOnce([{ id: CUSTOMER_ID, business_id: BUSINESS_ID, name: "C", document_number: null, email: null, phone: null, address: null, notes: null, is_active: true, created_at: "2026-01-01T00:00:00.000Z", updated_at: "2026-01-01T00:00:00.000Z" }]);
    mockSql.mockResolvedValueOnce([]);
    mockSql.mockResolvedValueOnce([]);

    const persist = buildPersist({
      items: [
        { description: "A", quantity: 1, unitPrice: 10000, lineTotal: 10000 },
        { description: "B", quantity: 2, unitPrice: 10000, lineTotal: 20000 },
        { description: "C", quantity: 3, unitPrice: 10000, lineTotal: 30000 },
      ],
      subtotal: 60000,
      total: 60000,
    });

    await invoiceRepo.update(BUSINESS_ID, INVOICE_ID, persist);

    const [queriesArg] = mockSql.transaction.mock.calls[0]!;
    // lock + update + delete + 3 inserts = 6 statements, ONE transaction.
    expect(queriesArg).toEqual(["LOCK_QUERY", "UPDATE_QUERY", "DELETE_QUERY", "INSERT_1", "INSERT_2", "INSERT_3"]);
    expect(mockSql.transaction).toHaveBeenCalledTimes(1);
  });

  it("scopes the lock statement to businessId, treating a different business's invoice id as missing (null)", async () => {
    mockSql
      .mockReturnValueOnce("LOCK_QUERY")
      .mockReturnValueOnce("UPDATE_QUERY")
      .mockReturnValueOnce("DELETE_QUERY")
      .mockReturnValueOnce("INSERT_QUERY");
    mockSql.transaction.mockResolvedValueOnce([[], [], [], []]);

    const result = await invoiceRepo.update(OTHER_BUSINESS_ID, INVOICE_ID, buildPersist());

    expect(result).toBeNull();
    const [lockStrings, ...lockValues] = mockSql.mock.calls[0]!;
    expect(Array.from(lockStrings as unknown as string[]).join("")).toContain("business_id");
    expect(lockValues).toEqual([INVOICE_ID, OTHER_BUSINESS_ID]);
  });

  it("propagates the error and fabricates nothing when sql.transaction rejects", async () => {
    mockSql
      .mockReturnValueOnce("LOCK_QUERY")
      .mockReturnValueOnce("UPDATE_QUERY")
      .mockReturnValueOnce("DELETE_QUERY")
      .mockReturnValueOnce("INSERT_QUERY");
    mockSql.transaction.mockRejectedValueOnce(new Error("simulated transaction failure"));

    await expect(invoiceRepo.update(BUSINESS_ID, INVOICE_ID, buildPersist())).rejects.toThrow(
      "simulated transaction failure",
    );
  });
});
