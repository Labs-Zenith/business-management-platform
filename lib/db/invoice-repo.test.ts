import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Mirrors `lib/db/inventory-repo.test.ts`'s mock shape (a `vi.fn()` `sql` tag
 * PLUS a mocked `sql.transaction`), because `update` now runs a SINGLE
 * `sql.transaction([...])` containing EVERY mutating statement:
 *   [0] `SELECT ... FOR UPDATE` locks the invoice row,
 *   [1] a guarded wholesale item `DELETE`,
 *   [2..N-1] one guarded `INSERT ... SELECT ... WHERE EXISTS(...)` per item,
 *   [N] (LAST) the fresh compound guard ("not fully paid" AND "new total not
 *       below paid") + conditional header `UPDATE`.
 *
 * ORDER IS SAFETY-CRITICAL (data-corruption fix): the header UPDATE MUST run
 * LAST, strictly after the item DELETE/INSERTs. Every item guard re-reads
 * `invoices.total` via its own correlated subquery; under READ COMMITTED, a
 * later statement in the SAME transaction sees the transaction's own prior
 * writes. If the header UPDATE ran first (as it originally did), it would
 * mutate `invoices.total` to the NEW total, and the later item guards would
 * then observe THAT new total instead of the pre-edit one — at the exact
 * boundary where the new total equals `paidAmount`, this silently turned
 * `(newTotal - paid) > 0` into `(0) > 0` = FALSE, no-op'ing the item
 * replacement while the header still committed: a torn, inconsistent state
 * with no error thrown, deterministically (no concurrency needed). Keeping
 * the header last guarantees every statement's guard evaluates against the
 * SAME pre-edit total.
 *
 * The item DELETE/INSERTs are NOT separate, un-transacted round trips (the
 * original pre-fix bug: a header committed with new totals while a later item
 * INSERT failed left a persisted invoice whose totals didn't match its items).
 * Every statement carries the SAME "business_id matches AND (balance > 0 AND
 * new total >= paid)" guard so a fully-paid, below-paid, or cross-business
 * edit mutates NOTHING even though a non-interactive transaction runs all
 * statements.
 *
 * Critical assertions: `update` (a) hands ALL statements to
 * `sql.transaction([...])` in ONE call, lock-then-delete-then-insert-then-
 * update (header LAST) order, (b) interpolates the correct VALUES (not just
 * text) into every statement, (c) surfaces an empty statement-1 (lock) result
 * as `null` (missing/cross-business), (d) surfaces a non-empty lock result
 * with an empty LAST-statement (header) `RETURNING` as the edit-lock
 * `CONFLICT` (fully paid, or new total below the amount already paid), (e)
 * the statement order itself is asserted directly, so a regression that
 * reverts the header-last fix is caught even without Docker/a real Postgres.
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

function customerRow() {
  return {
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
      .mockReturnValueOnce("DELETE_QUERY")
      .mockReturnValueOnce("INSERT_QUERY")
      .mockReturnValueOnce("UPDATE_QUERY");
    // All 4 statements run in the non-interactive transaction; the guards make
    // the DELETE/INSERT/UPDATE no-ops when the invoice doesn't match.
    mockSql.transaction.mockResolvedValueOnce([[], [], [], []]);

    const result = await invoiceRepo.update(BUSINESS_ID, INVOICE_ID, buildPersist());

    expect(result).toBeNull();
    expect(mockSql.transaction).toHaveBeenCalledTimes(1);
    const [queriesArg] = mockSql.transaction.mock.calls[0]!;
    // Header UPDATE is the LAST statement — see file-level doc comment.
    expect(queriesArg).toEqual(["LOCK_QUERY", "DELETE_QUERY", "INSERT_QUERY", "UPDATE_QUERY"]);
    // Exactly the 4 transacted statements were built — no extra un-transacted
    // item round trip, and buildDetail is never reached on the null path.
    expect(mockSql).toHaveBeenCalledTimes(4);
  });

  it("throws CONFLICT (not NOT_FOUND, not a generic Error) when statement 1 found the invoice but the LAST (header UPDATE) statement's compound guard excluded the update (e.g. fully paid) — zero mutation", async () => {
    mockSql
      .mockReturnValueOnce("LOCK_QUERY")
      .mockReturnValueOnce("DELETE_QUERY")
      .mockReturnValueOnce("INSERT_QUERY")
      .mockReturnValueOnce("UPDATE_QUERY");
    // Invoice exists (statement 1 non-empty) but the invoice is fully paid ->
    // every guarded statement's compound guard excludes the row -> empty
    // result for delete/insert/update alike.
    mockSql.transaction.mockResolvedValueOnce([[{ id: INVOICE_ID }], [], [], []]);

    const { ApiError } = await import("@/lib/server/api-error");
    const error: unknown = await invoiceRepo
      .update(BUSINESS_ID, INVOICE_ID, buildPersist())
      .catch((err: unknown) => err);

    expect(error).toMatchObject({ code: "CONFLICT" });
    expect(error).toBeInstanceOf(ApiError);
    expect((error as { message: string }).message).toBe(
      "Invoice cannot be edited: it is fully paid, or the new total is below the amount already paid.",
    );

    // No mutation beyond building the single transaction's statements; no
    // buildDetail reads on the reject path.
    expect(mockSql.transaction).toHaveBeenCalledTimes(1);
    expect(mockSql).toHaveBeenCalledTimes(4);
  });

  it("throws the SAME CONFLICT when the guard excludes the update because the new total is below the amount already paid (guard is opaque to the caller — same empty-result path)", async () => {
    mockSql
      .mockReturnValueOnce("LOCK_QUERY")
      .mockReturnValueOnce("DELETE_QUERY")
      .mockReturnValueOnce("INSERT_QUERY")
      .mockReturnValueOnce("UPDATE_QUERY");
    // Invoice exists and is NOT fully paid, but the submitted new total is
    // below the amount already paid -> the guard still excludes the row ->
    // empty result, exactly like the fully-paid case.
    mockSql.transaction.mockResolvedValueOnce([[{ id: INVOICE_ID }], [], [], []]);

    await expect(
      invoiceRepo.update(BUSINESS_ID, INVOICE_ID, buildPersist({ total: 1000 })),
    ).rejects.toMatchObject({ code: "CONFLICT" });

    expect(mockSql.transaction).toHaveBeenCalledTimes(1);
  });

  it("interpolates the submitted new total as its OWN guard parameter (not reusing the SET clause's total placeholder) in the item DELETE, item INSERT, and header UPDATE guards", async () => {
    mockSql
      .mockReturnValueOnce("LOCK_QUERY")
      .mockReturnValueOnce("DELETE_QUERY")
      .mockReturnValueOnce("INSERT_QUERY")
      .mockReturnValueOnce("UPDATE_QUERY");
    mockSql.transaction.mockResolvedValueOnce([[{ id: INVOICE_ID }], [], [], [invoiceRow()]]);
    mockSql.mockResolvedValueOnce([customerRow()]);
    mockSql.mockResolvedValueOnce([]);
    mockSql.mockResolvedValueOnce([]);

    const persist = buildPersist();
    await invoiceRepo.update(BUSINESS_ID, INVOICE_ID, persist);

    const [deleteStrings, ...deleteValues] = mockSql.mock.calls[1]!;
    expect(Array.from(deleteStrings as unknown as string[]).join("")).toContain(">=");
    expect(deleteValues[deleteValues.length - 1]).toBe(persist.total);

    const [insertStrings, ...insertValues] = mockSql.mock.calls[2]!;
    expect(Array.from(insertStrings as unknown as string[]).join("")).toContain(">=");
    expect(insertValues[insertValues.length - 1]).toBe(persist.total);

    const [updStrings, ...updValues] = mockSql.mock.calls[3]!;
    expect(Array.from(updStrings as unknown as string[]).join("")).toContain(">=");
    expect(updValues[updValues.length - 1]).toBe(persist.total);
  });

  it("hands ALL statements to sql.transaction in one call — lock, guarded item DELETE, guarded item INSERT, guarded header UPDATE LAST — with correct text AND interpolated values", async () => {
    mockSql
      .mockReturnValueOnce("LOCK_QUERY")
      .mockReturnValueOnce("DELETE_QUERY")
      .mockReturnValueOnce("INSERT_QUERY")
      .mockReturnValueOnce("UPDATE_QUERY");
    mockSql.transaction.mockResolvedValueOnce([[{ id: INVOICE_ID }], [], [], [invoiceRow()]]);
    // buildDetail's Promise.all (customer, items, payments) reads AFTER the
    // transaction resolves, to build the returned `InvoiceDetail`.
    mockSql.mockResolvedValueOnce([customerRow()]); // customerRows
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

    // --- Statement 2: guarded item DELETE, text AND interpolated values. ---
    const [deleteStrings, ...deleteValues] = mockSql.mock.calls[1]!;
    const deleteText = Array.from(deleteStrings as unknown as string[]).join("");
    expect(deleteText).toContain("DELETE FROM invoice_items");
    expect(deleteText).toContain("EXISTS");
    expect(deleteText).toContain("COALESCE");
    // Guard: invoice_id, then EXISTS(id,businessId), then the new-total guard param.
    expect(deleteValues).toEqual([INVOICE_ID, INVOICE_ID, BUSINESS_ID, persist.total]);

    // --- Statement 3: guarded item INSERT (one per item), text AND values. ---
    const [insertStrings, ...insertValues] = mockSql.mock.calls[2]!;
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
      persist.total, // guard: new total >= paid
    ]);

    // --- Statement 4 (LAST): guarded header UPDATE, text AND interpolated values. ---
    const [updStrings, ...updValues] = mockSql.mock.calls[3]!;
    const updText = Array.from(updStrings as unknown as string[]).join("");
    expect(updText).toContain("UPDATE invoices SET");
    // Compound guard: not-fully-paid (balance > 0) AND new total not below paid.
    expect(updText).toContain("COALESCE");
    expect(updText).toContain("> 0");
    expect(updText).toContain(">=");
    expect(updText).toContain("RETURNING");
    expect(updText).not.toContain("FOR UPDATE");
    // `number` is never part of the SET clause — immutable.
    expect(updText).not.toMatch(/number\s*=/);
    // VALUES in SET-then-WHERE-then-guard order (the new total appears twice:
    // once in the SET clause, once as the guard's own placeholder).
    expect(updValues).toEqual([
      CUSTOMER_ID, // customer_id
      persist.issueDate, // issue_date
      persist.dueDate, // due_date
      persist.subtotal, // subtotal
      persist.total, // total (SET clause)
      persist.status, // status
      persist.notes, // notes
      INVOICE_ID, // WHERE id
      BUSINESS_ID, // WHERE business_id
      persist.total, // guard: new total >= paid
    ]);

    // ONE transaction call containing all four statements, header UPDATE LAST.
    expect(mockSql.transaction).toHaveBeenCalledTimes(1);
    const [queriesArg] = mockSql.transaction.mock.calls[0]!;
    expect(queriesArg).toEqual(["LOCK_QUERY", "DELETE_QUERY", "INSERT_QUERY", "UPDATE_QUERY"]);
  });

  it("REGRESSION GUARD: the statement order is EXACTLY [lock, DELETE, INSERT..., header UPDATE] — header UPDATE must be LAST, never before the item statements (data-corruption fix)", async () => {
    mockSql
      .mockReturnValueOnce("LOCK_QUERY")
      .mockReturnValueOnce("DELETE_QUERY")
      .mockReturnValueOnce("INSERT_1")
      .mockReturnValueOnce("INSERT_2")
      .mockReturnValueOnce("UPDATE_QUERY");
    mockSql.transaction.mockResolvedValueOnce([[{ id: INVOICE_ID }], [], [], [], [invoiceRow()]]);
    mockSql.mockResolvedValueOnce([customerRow()]);
    mockSql.mockResolvedValueOnce([]);
    mockSql.mockResolvedValueOnce([]);

    const persist = buildPersist({
      items: [
        { description: "A", quantity: 1, unitPrice: 10000, lineTotal: 10000 },
        { description: "B", quantity: 2, unitPrice: 25000, lineTotal: 50000 },
      ],
      subtotal: 60000,
      total: 60000,
    });

    await invoiceRepo.update(BUSINESS_ID, INVOICE_ID, persist);

    const [queriesArg] = mockSql.transaction.mock.calls[0]! as unknown[][];
    const queries = queriesArg as string[];

    // The lock is always first.
    expect(queries[0]).toBe("LOCK_QUERY");
    // The header UPDATE is always the LAST element, whatever the item count.
    expect(queries[queries.length - 1]).toBe("UPDATE_QUERY");
    // Every item statement (DELETE + one INSERT per item) sits strictly
    // BETWEEN the lock and the header UPDATE — never after it.
    expect(queries.slice(1, queries.length - 1)).toEqual(["DELETE_QUERY", "INSERT_1", "INSERT_2"]);
    // Full exact order, spelled out.
    expect(queries).toEqual(["LOCK_QUERY", "DELETE_QUERY", "INSERT_1", "INSERT_2", "UPDATE_QUERY"]);
  });

  it("builds one guarded INSERT statement per item, all inside the single transaction, with the header UPDATE still last", async () => {
    mockSql
      .mockReturnValueOnce("LOCK_QUERY")
      .mockReturnValueOnce("DELETE_QUERY")
      .mockReturnValueOnce("INSERT_1")
      .mockReturnValueOnce("INSERT_2")
      .mockReturnValueOnce("INSERT_3")
      .mockReturnValueOnce("UPDATE_QUERY");
    mockSql.transaction.mockResolvedValueOnce([[{ id: INVOICE_ID }], [], [], [], [], [invoiceRow()]]);
    // buildDetail reads.
    mockSql.mockResolvedValueOnce([customerRow()]);
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
    // lock + delete + 3 inserts + update = 6 statements, ONE transaction,
    // header UPDATE still last.
    expect(queriesArg).toEqual(["LOCK_QUERY", "DELETE_QUERY", "INSERT_1", "INSERT_2", "INSERT_3", "UPDATE_QUERY"]);
    expect(mockSql.transaction).toHaveBeenCalledTimes(1);
  });

  it("scopes the lock statement to businessId, treating a different business's invoice id as missing (null)", async () => {
    mockSql
      .mockReturnValueOnce("LOCK_QUERY")
      .mockReturnValueOnce("DELETE_QUERY")
      .mockReturnValueOnce("INSERT_QUERY")
      .mockReturnValueOnce("UPDATE_QUERY");
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
      .mockReturnValueOnce("DELETE_QUERY")
      .mockReturnValueOnce("INSERT_QUERY")
      .mockReturnValueOnce("UPDATE_QUERY");
    mockSql.transaction.mockRejectedValueOnce(new Error("simulated transaction failure"));

    await expect(invoiceRepo.update(BUSINESS_ID, INVOICE_ID, buildPersist())).rejects.toThrow(
      "simulated transaction failure",
    );
  });
});
