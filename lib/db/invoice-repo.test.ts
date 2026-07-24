import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Mirrors `lib/db/inventory-repo.test.ts`'s mock shape (a `vi.fn()` `sql` tag
 * PLUS a mocked `runTransaction`), because `update` now runs a SINGLE
 * `runTransaction(async (tx) => {...})` callback (postgres.js's interactive
 * `sql.begin`) containing EVERY mutating statement, run as sequential awaits
 * against the SAME `tx`:
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
 * edit mutates NOTHING even though every statement still runs.
 *
 * Critical assertions: `update` (a) runs ALL statements sequentially against
 * the SAME `tx` inside ONE `runTransaction` callback, lock-then-delete-then-
 * insert-then-update (header LAST) order, (b) interpolates the correct
 * VALUES (not just text) into every statement, (c) surfaces an empty
 * statement-1 (lock) result as `null` (missing/cross-business), (d) surfaces
 * a non-empty lock result with an empty LAST-statement (header) `RETURNING`
 * as the edit-lock `CONFLICT` (fully paid, or new total below the amount
 * already paid), (e) the statement order itself is asserted directly, so a
 * regression that reverts the header-last fix is caught even without
 * Docker/a real Postgres.
 *
 * Product-line inventory support (invoice-item-product change) inserts TWO
 * extra READ-ONLY statements right after the lock — an `editAllowed`
 * guard-check (`SELECT 1 ...`) and an old-product-items read — so EVERY
 * `update` test's `mockTx` sequence/count below is offset by +2 versus the
 * pre-existing shape. The reversal (`in`)/decrement (`out`) inventory
 * statements themselves are conditionally added (only for items that
 * reference a real `productId`, and only when `editAllowed` is true) — see
 * `lib/db/invoice-repo.ts#update`'s own doc comment for why the edit-lock
 * guard is evaluated ONCE, in JS, rather than embedded in the SAME `WHERE`
 * as the floor-at-zero check.
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

const { invoiceRepo } = await import("./invoice-repo");

const BUSINESS_ID = "10000000-0000-4000-8000-000000000001";
const OTHER_BUSINESS_ID = "10000000-0000-4000-8000-000000000099";
const INVOICE_ID = "50000000-0000-4000-8000-000000000001";
const CUSTOMER_ID = "40000000-0000-4000-8000-000000000001";
const INVOICE_TYPE_ID = "c1000000-0000-4000-8000-000000000001";

function invoiceRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: INVOICE_ID,
    business_id: BUSINESS_ID,
    customer_id: CUSTOMER_ID,
    invoice_type_id: INVOICE_TYPE_ID,
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
    items: [{ description: "Servicio editado", quantity: 2, unitPrice: 30000, productId: null, lineTotal: 60000 }],
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
    mockTx.mockReset();
    mockRunTransaction.mockReset();
    mockRunTransaction.mockImplementation((fn: (tx: typeof mockTx) => Promise<unknown>) => fn(mockTx));
  });

  it("returns null (missing/cross-business, never leaked) when statement 1 (FOR UPDATE lock) matches no invoice row, and mutates nothing", async () => {
    // All 6 statements run against `tx`; the guards make the
    // DELETE/INSERT/UPDATE no-ops when the invoice doesn't match, and the
    // inventory reversal/decrement loops never run since `editAllowed` is
    // false (guard-check statement returns empty).
    mockTx
      .mockResolvedValueOnce([]) // lock
      .mockResolvedValueOnce([]) // guard-check
      .mockResolvedValueOnce([]) // old product items
      .mockResolvedValueOnce([]) // delete
      .mockResolvedValueOnce([]) // insert
      .mockResolvedValueOnce([]); // header update

    const result = await invoiceRepo.update(BUSINESS_ID, INVOICE_ID, buildPersist());

    expect(result).toBeNull();
    expect(mockRunTransaction).toHaveBeenCalledTimes(1);
    // Exactly the 6 transacted statements were run — no extra un-transacted
    // item round trip, and buildDetail is never reached on the null path.
    expect(mockTx).toHaveBeenCalledTimes(6);
    expect(mockSql).not.toHaveBeenCalled();
  });

  it("throws CONFLICT (not NOT_FOUND, not a generic Error) when statement 1 found the invoice but the LAST (header UPDATE) statement's compound guard excluded the update (e.g. fully paid) — zero mutation", async () => {
    // Invoice exists (statement 1 non-empty) but the invoice is fully paid ->
    // every guarded statement's compound guard excludes the row -> empty
    // result for the guard-check/delete/insert/update alike.
    mockTx
      .mockResolvedValueOnce([{ id: INVOICE_ID }]) // lock
      .mockResolvedValueOnce([]) // guard-check (not allowed — fully paid)
      .mockResolvedValueOnce([]) // old product items
      .mockResolvedValueOnce([]) // delete
      .mockResolvedValueOnce([]) // insert
      .mockResolvedValueOnce([]); // header update

    const { ApiError } = await import("@/lib/server/api-error");
    const error: unknown = await invoiceRepo
      .update(BUSINESS_ID, INVOICE_ID, buildPersist())
      .catch((err: unknown) => err);

    expect(error).toMatchObject({ code: "CONFLICT" });
    expect(error).toBeInstanceOf(ApiError);
    expect((error as { message: string }).message).toBe(
      "Invoice cannot be edited: it is fully paid, or the new total is below the amount already paid.",
    );

    // No mutation beyond running the single transaction's statements; no
    // buildDetail reads on the reject path.
    expect(mockRunTransaction).toHaveBeenCalledTimes(1);
    expect(mockTx).toHaveBeenCalledTimes(6);
  });

  it("throws the SAME CONFLICT when the guard excludes the update because the new total is below the amount already paid (guard is opaque to the caller — same empty-result path)", async () => {
    // Invoice exists and is NOT fully paid, but the submitted new total is
    // below the amount already paid -> the guard still excludes the row ->
    // empty result, exactly like the fully-paid case.
    mockTx
      .mockResolvedValueOnce([{ id: INVOICE_ID }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    await expect(
      invoiceRepo.update(BUSINESS_ID, INVOICE_ID, buildPersist({ total: 1000 })),
    ).rejects.toMatchObject({ code: "CONFLICT" });

    expect(mockRunTransaction).toHaveBeenCalledTimes(1);
  });

  it("interpolates the submitted new total as its OWN guard parameter (not reusing the SET clause's total placeholder) in the item DELETE, item INSERT, and header UPDATE guards", async () => {
    mockTx
      .mockResolvedValueOnce([{ id: INVOICE_ID }]) // lock
      .mockResolvedValueOnce([{}]) // guard-check (edit allowed)
      .mockResolvedValueOnce([]) // old product items
      .mockResolvedValueOnce([]) // delete
      .mockResolvedValueOnce([]) // insert
      .mockResolvedValueOnce([invoiceRow()]); // header update
    mockSql.mockResolvedValueOnce([customerRow()]);
    mockSql.mockResolvedValueOnce([]);
    mockSql.mockResolvedValueOnce([]);

    const persist = buildPersist();
    await invoiceRepo.update(BUSINESS_ID, INVOICE_ID, persist);

    const [deleteStrings, ...deleteValues] = mockTx.mock.calls[3]!;
    expect(Array.from(deleteStrings as unknown as string[]).join("")).toContain(">=");
    expect(deleteValues[deleteValues.length - 1]).toBe(persist.total);

    const [insertStrings, ...insertValues] = mockTx.mock.calls[4]!;
    expect(Array.from(insertStrings as unknown as string[]).join("")).toContain(">=");
    expect(insertValues[insertValues.length - 1]).toBe(persist.total);

    const [updStrings, ...updValues] = mockTx.mock.calls[5]!;
    expect(Array.from(updStrings as unknown as string[]).join("")).toContain(">=");
    expect(updValues[updValues.length - 1]).toBe(persist.total);
  });

  it("runs ALL statements sequentially against the SAME tx inside ONE runTransaction callback — lock, guard-check, old-items read, guarded item DELETE, guarded item INSERT, guarded header UPDATE LAST — with correct text AND interpolated values", async () => {
    mockTx
      .mockResolvedValueOnce([{ id: INVOICE_ID }]) // lock
      .mockResolvedValueOnce([{}]) // guard-check (edit allowed)
      .mockResolvedValueOnce([]) // old product items (none)
      .mockResolvedValueOnce([]) // delete
      .mockResolvedValueOnce([]) // insert
      .mockResolvedValueOnce([invoiceRow()]); // header update
    // buildDetail's Promise.all (customer, items, payments) reads AFTER the
    // transaction resolves, via the plain `sql` tag (not `tx`), to build the
    // returned `InvoiceDetail`.
    mockSql.mockResolvedValueOnce([customerRow()]); // customerRows
    mockSql.mockResolvedValueOnce([
      {
        id: "60000000-0000-4000-8000-000000000001",
        invoice_id: INVOICE_ID,
        description: "Servicio editado",
        quantity: "2",
        unit_price: 30000,
        line_total: 60000,
        product_id: null,
      },
    ]); // itemRows
    mockSql.mockResolvedValueOnce([]); // paymentRows

    const persist = buildPersist();
    const updated = await invoiceRepo.update(BUSINESS_ID, INVOICE_ID, persist);

    expect(updated).not.toBeNull();
    expect(updated!.number).toBe("FAC-0001");
    expect(updated!.total).toBe(60000);

    // --- Statement 1: locks the invoice row, scoped to id + business_id. ---
    const [lockStrings, ...lockValues] = mockTx.mock.calls[0]!;
    const lockText = Array.from(lockStrings as unknown as string[]).join("");
    expect(lockText).toContain("SELECT id FROM invoices");
    expect(lockText).toContain("FOR UPDATE");
    expect(lockText).not.toContain("UPDATE invoices SET");
    expect(lockValues).toEqual([INVOICE_ID, BUSINESS_ID]);

    // --- Statement 2: edit-allowed guard-check (read-only). ---
    const guardText = Array.from(mockTx.mock.calls[1]![0] as unknown as string[]).join("");
    expect(guardText).toContain("SELECT 1 FROM invoices");

    // --- Statement 3: old product items read (read-only). ---
    const oldItemsText = Array.from(mockTx.mock.calls[2]![0] as unknown as string[]).join("");
    expect(oldItemsText).toContain("SELECT product_id, quantity FROM invoice_items");

    // --- Statement 4: guarded item DELETE, text AND interpolated values. ---
    const [deleteStrings, ...deleteValues] = mockTx.mock.calls[3]!;
    const deleteText = Array.from(deleteStrings as unknown as string[]).join("");
    expect(deleteText).toContain("DELETE FROM invoice_items");
    expect(deleteText).toContain("EXISTS");
    expect(deleteText).toContain("COALESCE");
    // Guard: invoice_id, then EXISTS(id,businessId), then the new-total guard param.
    expect(deleteValues).toEqual([INVOICE_ID, INVOICE_ID, BUSINESS_ID, persist.total]);

    // --- Statement 5: guarded item INSERT (one per item), text AND values. ---
    const [insertStrings, ...insertValues] = mockTx.mock.calls[4]!;
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
      item.productId,
      INVOICE_ID, // EXISTS(... i.id
      BUSINESS_ID, // EXISTS(... i.business_id
      persist.total, // guard: new total >= paid
    ]);

    // --- Statement 6 (LAST): guarded header UPDATE, text AND interpolated values. ---
    const [updStrings, ...updValues] = mockTx.mock.calls[5]!;
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

    // ONE transaction callback, running all six statements against `tx`,
    // header UPDATE LAST.
    expect(mockRunTransaction).toHaveBeenCalledTimes(1);
    expect(mockTx).toHaveBeenCalledTimes(6);
  });

  it("REGRESSION GUARD: the statement order is EXACTLY [lock, DELETE, INSERT..., header UPDATE] — header UPDATE must be LAST, never before the item statements (data-corruption fix)", async () => {
    mockTx
      .mockResolvedValueOnce([{ id: INVOICE_ID }]) // lock
      .mockResolvedValueOnce([{}]) // guard-check (edit allowed)
      .mockResolvedValueOnce([]) // old product items (none)
      .mockResolvedValueOnce([]) // delete
      .mockResolvedValueOnce([]) // insert item A
      .mockResolvedValueOnce([]) // insert item B
      .mockResolvedValueOnce([invoiceRow()]); // header update (LAST)
    mockSql.mockResolvedValueOnce([customerRow()]);
    mockSql.mockResolvedValueOnce([]);
    mockSql.mockResolvedValueOnce([]);

    const persist = buildPersist({
      items: [
        { description: "A", quantity: 1, unitPrice: 10000, productId: null, lineTotal: 10000 },
        { description: "B", quantity: 2, unitPrice: 25000, productId: null, lineTotal: 50000 },
      ],
      subtotal: 60000,
      total: 60000,
    });

    await invoiceRepo.update(BUSINESS_ID, INVOICE_ID, persist);

    // Exactly 7 statements: lock, guard-check, old-items select, delete, 2
    // item inserts, header update LAST.
    expect(mockTx).toHaveBeenCalledTimes(7);

    const callText = (i: number) => Array.from(mockTx.mock.calls[i]![0] as unknown as string[]).join("");
    expect(callText(0)).toContain("FOR UPDATE"); // lock is always first
    expect(callText(1)).toContain("SELECT 1 FROM invoices"); // edit-allowed guard check
    expect(callText(2)).toContain("SELECT product_id, quantity FROM invoice_items"); // old product items
    expect(callText(3)).toContain("DELETE FROM invoice_items");
    expect(callText(4)).toContain("INSERT INTO invoice_items");
    expect(callText(5)).toContain("INSERT INTO invoice_items");
    // The header UPDATE is always the LAST call, whatever the item count.
    expect(callText(6)).toContain("UPDATE invoices SET");

    // The two item INSERTs carry each item's own description, in order —
    // never after the header UPDATE.
    expect(mockTx.mock.calls[4]![1]).toBe(INVOICE_ID);
    expect(mockTx.mock.calls[4]![2]).toBe("A");
    expect(mockTx.mock.calls[5]![2]).toBe("B");
  });

  it("builds one guarded INSERT statement per item, all inside the single transaction, with the header UPDATE still last", async () => {
    mockTx
      .mockResolvedValueOnce([{ id: INVOICE_ID }]) // lock
      .mockResolvedValueOnce([{}]) // guard-check (edit allowed)
      .mockResolvedValueOnce([]) // old product items (none)
      .mockResolvedValueOnce([]) // delete
      .mockResolvedValueOnce([]) // insert item A
      .mockResolvedValueOnce([]) // insert item B
      .mockResolvedValueOnce([]) // insert item C
      .mockResolvedValueOnce([invoiceRow()]); // header update (LAST)
    // buildDetail reads.
    mockSql.mockResolvedValueOnce([customerRow()]);
    mockSql.mockResolvedValueOnce([]);
    mockSql.mockResolvedValueOnce([]);

    const persist = buildPersist({
      items: [
        { description: "A", quantity: 1, unitPrice: 10000, productId: null, lineTotal: 10000 },
        { description: "B", quantity: 2, unitPrice: 10000, productId: null, lineTotal: 20000 },
        { description: "C", quantity: 3, unitPrice: 10000, productId: null, lineTotal: 30000 },
      ],
      subtotal: 60000,
      total: 60000,
    });

    await invoiceRepo.update(BUSINESS_ID, INVOICE_ID, persist);

    // lock + guard-check + old-items + delete + 3 inserts + update = 8
    // statements, ONE transaction callback, header UPDATE still last.
    expect(mockTx).toHaveBeenCalledTimes(8);
    expect(mockRunTransaction).toHaveBeenCalledTimes(1);
    const lastCallText = Array.from(mockTx.mock.calls[7]![0] as unknown as string[]).join("");
    expect(lastCallText).toContain("UPDATE invoices SET");
  });

  it("restores old product lines (`in`) and decrements new product lines (`out`), in that order, when the edit is allowed", async () => {
    const OLD_PRODUCT_ID = "80000000-0000-4000-8000-000000000001";
    const NEW_PRODUCT_ID = "80000000-0000-4000-8000-000000000002";
    mockTx
      .mockResolvedValueOnce([{ id: INVOICE_ID }]) // lock
      .mockResolvedValueOnce([{}]) // guard-check (edit allowed)
      .mockResolvedValueOnce([{ product_id: OLD_PRODUCT_ID, quantity: "5" }]) // old product items
      .mockResolvedValueOnce([]) // delete
      .mockResolvedValueOnce([]) // insert new item
      .mockResolvedValueOnce([]) // reversal `in` movement insert (no RETURNING)
      .mockResolvedValueOnce([{ id: "90000000-0000-4000-8000-000000000002" }]) // guarded `out` movement insert (success)
      .mockResolvedValueOnce([invoiceRow()]); // header update (LAST)
    mockSql.mockResolvedValueOnce([customerRow()]);
    mockSql.mockResolvedValueOnce([]);
    mockSql.mockResolvedValueOnce([]);

    const persist = buildPersist({
      items: [{ description: "Tijera", quantity: 2, unitPrice: 30000, productId: NEW_PRODUCT_ID, lineTotal: 60000 }],
    });
    await invoiceRepo.update(BUSINESS_ID, INVOICE_ID, persist);

    expect(mockTx).toHaveBeenCalledTimes(8);

    const [reversalStrings, ...reversalValues] = mockTx.mock.calls[5]!;
    const reversalText = Array.from(reversalStrings as unknown as string[]).join("");
    expect(reversalText).toContain("INSERT INTO inventory_movements");
    expect(reversalText).toContain("'in'");
    expect(reversalValues).toContain(OLD_PRODUCT_ID);
    expect(reversalValues).toContain("5");

    const [decrementStrings, ...decrementValues] = mockTx.mock.calls[6]!;
    const decrementText = Array.from(decrementStrings as unknown as string[]).join("");
    expect(decrementText).toContain("INSERT INTO inventory_movements");
    expect(decrementText).toContain("'out'");
    expect(decrementValues).toContain(NEW_PRODUCT_ID);
    expect(decrementValues).toContain(2);

    // Header UPDATE is still LAST, after both inventory statements.
    const headerText = Array.from(mockTx.mock.calls[7]![0] as unknown as string[]).join("");
    expect(headerText).toContain("UPDATE invoices SET");
  });

  it("throws VALIDATION_ERROR (rolling back the reversal too) when the new product line's guarded decrement returns ZERO rows (overdraw)", async () => {
    const OLD_PRODUCT_ID = "80000000-0000-4000-8000-000000000001";
    const NEW_PRODUCT_ID = "80000000-0000-4000-8000-000000000002";
    mockTx
      .mockResolvedValueOnce([{ id: INVOICE_ID }]) // lock
      .mockResolvedValueOnce([{}]) // guard-check (edit allowed)
      .mockResolvedValueOnce([{ product_id: OLD_PRODUCT_ID, quantity: "5" }]) // old product items
      .mockResolvedValueOnce([]) // delete
      .mockResolvedValueOnce([]) // insert new item
      .mockResolvedValueOnce([]) // reversal `in` movement insert
      .mockResolvedValueOnce([]); // guarded `out` movement insert -> 0 rows (overdraw)

    const persist = buildPersist({
      items: [{ description: "Tijera", quantity: 999, unitPrice: 30000, productId: NEW_PRODUCT_ID, lineTotal: 29970000 }],
    });

    await expect(invoiceRepo.update(BUSINESS_ID, INVOICE_ID, persist)).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
    });
    expect(mockSql).not.toHaveBeenCalled();
  });

  it("skips the reversal/decrement inventory statements entirely when the edit-allowed guard fails, even if the invoice HAS old product-linked items", async () => {
    const OLD_PRODUCT_ID = "80000000-0000-4000-8000-000000000001";
    mockTx
      .mockResolvedValueOnce([{ id: INVOICE_ID }]) // lock
      .mockResolvedValueOnce([]) // guard-check fails (e.g. fully paid)
      .mockResolvedValueOnce([{ product_id: OLD_PRODUCT_ID, quantity: "5" }]) // old product items (present, but irrelevant)
      .mockResolvedValueOnce([]) // delete (no-op, guard fails)
      .mockResolvedValueOnce([]) // insert (no-op, guard fails)
      .mockResolvedValueOnce([]); // header update (no-op, guard fails)

    await expect(invoiceRepo.update(BUSINESS_ID, INVOICE_ID, buildPersist())).rejects.toMatchObject({
      code: "CONFLICT",
    });

    // Exactly 6 statements — NO extra reversal/decrement inventory_movements
    // statements were attempted, even though old product items existed.
    expect(mockTx).toHaveBeenCalledTimes(6);
  });

  it("scopes the lock statement to businessId, treating a different business's invoice id as missing (null)", async () => {
    mockTx
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const result = await invoiceRepo.update(OTHER_BUSINESS_ID, INVOICE_ID, buildPersist());

    expect(result).toBeNull();
    const [lockStrings, ...lockValues] = mockTx.mock.calls[0]!;
    expect(Array.from(lockStrings as unknown as string[]).join("")).toContain("business_id");
    expect(lockValues).toEqual([INVOICE_ID, OTHER_BUSINESS_ID]);
  });

  it("propagates the error and fabricates nothing when the transaction rejects", async () => {
    mockRunTransaction.mockRejectedValueOnce(new Error("simulated transaction failure"));

    await expect(invoiceRepo.update(BUSINESS_ID, INVOICE_ID, buildPersist())).rejects.toThrow(
      "simulated transaction failure",
    );
  });
});

/**
 * `create` (Wave 1A data-model foundation): sequence bump + type resolution
 * + header INSERT + every item INSERT now all run inside ONE
 * `runTransaction` callback (previously the sequence bump was a separate,
 * un-transacted `sql` call before the header/items — a failing item INSERT
 * could leave a bumped sequence number with no invoice ever persisted for
 * it). Mirrors `update`'s established single-transaction test shape.
 */
describe("db invoiceRepo.create — atomic per-(business,type) numbering (safety-critical)", () => {
  beforeEach(() => {
    mockSql.mockReset();
    mockTx.mockReset();
    mockRunTransaction.mockReset();
    mockRunTransaction.mockImplementation((fn: (tx: typeof mockTx) => Promise<unknown>) => fn(mockTx));
  });

  it("runs the sequence-bump/type-resolve + header INSERT + item INSERT(s) sequentially inside ONE runTransaction callback, in that order", async () => {
    mockTx
      .mockResolvedValueOnce([{ invoice_type_id: INVOICE_TYPE_ID, seq: 7, prefix: "FAC" }]) // statement 1: sequence bump + type resolve
      .mockResolvedValueOnce([invoiceRow({ number: "FAC-0007" })]) // statement 2: header insert
      .mockResolvedValueOnce([]); // statement 3: item insert
    mockSql.mockResolvedValueOnce([customerRow()]); // buildDetail: customer
    mockSql.mockResolvedValueOnce([
      { id: "60000000-0000-4000-8000-000000000001", invoice_id: INVOICE_ID, description: "Servicio", quantity: "1", unit_price: 100000, line_total: 100000 },
    ]); // buildDetail: items
    mockSql.mockResolvedValueOnce([]); // buildDetail: payments

    const persist = buildPersist({
      items: [{ description: "Servicio", quantity: 1, unitPrice: 100000, productId: null, lineTotal: 100000 }],
      subtotal: 100000,
      total: 100000,
    });
    const detail = await invoiceRepo.create(BUSINESS_ID, persist);

    expect(detail.number).toBe("FAC-0007");
    expect(mockRunTransaction).toHaveBeenCalledTimes(1);
    expect(mockTx).toHaveBeenCalledTimes(3); // seq+type resolve, header, ONE item

    const seqText = Array.from(mockTx.mock.calls[0]![0] as unknown as string[]).join("");
    expect(seqText).toContain("invoice_sequences");
    expect(seqText).toContain("ON CONFLICT");
    expect(seqText).toContain("invoice_types");

    const headerText = Array.from(mockTx.mock.calls[1]![0] as unknown as string[]).join("");
    expect(headerText).toContain("INSERT INTO invoices");
    expect(headerText).toContain("RETURNING");

    const itemText = Array.from(mockTx.mock.calls[2]![0] as unknown as string[]).join("");
    expect(itemText).toContain("INSERT INTO invoice_items");
  });

  it("defaults to the 'venta' type via COALESCE when data.invoiceTypeId is not supplied (interpolates null, not a forged id)", async () => {
    mockTx
      .mockResolvedValueOnce([{ invoice_type_id: INVOICE_TYPE_ID, seq: 1, prefix: "FAC" }])
      .mockResolvedValueOnce([invoiceRow({ number: "FAC-0001" })])
      .mockResolvedValueOnce([]);
    mockSql.mockResolvedValueOnce([customerRow()]);
    mockSql.mockResolvedValueOnce([]);
    mockSql.mockResolvedValueOnce([]);

    await invoiceRepo.create(BUSINESS_ID, buildPersist({ items: [{ description: "X", quantity: 1, unitPrice: 1, productId: null, lineTotal: 1 }] }));

    const [, ...seqValues] = mockTx.mock.calls[0]!;
    // First interpolated value is the COALESCE's explicit-id slot — null,
    // since `data.invoiceTypeId` was not supplied.
    expect(seqValues[0]).toBeNull();
  });

  it("locks the product row and inserts a guarded `out` inventory movement, in the SAME transaction, for an item linked to a real product (productId != null)", async () => {
    const PRODUCT_ID = "80000000-0000-4000-8000-000000000001";
    mockTx
      .mockResolvedValueOnce([{ invoice_type_id: INVOICE_TYPE_ID, seq: 1, prefix: "FAC" }]) // seq+type resolve
      .mockResolvedValueOnce([invoiceRow({ number: "FAC-0001" })]) // header insert
      .mockResolvedValueOnce([]) // item insert (no RETURNING)
      .mockResolvedValueOnce([{ id: PRODUCT_ID }]) // product lock (found)
      .mockResolvedValueOnce([{ id: "90000000-0000-4000-8000-000000000001" }]); // guarded movement insert (success)
    mockSql.mockResolvedValueOnce([customerRow()]);
    mockSql.mockResolvedValueOnce([]);
    mockSql.mockResolvedValueOnce([]);

    const persist = buildPersist({
      items: [{ description: "Shampoo", quantity: 3, unitPrice: 25000, productId: PRODUCT_ID, lineTotal: 75000 }],
      subtotal: 75000,
      total: 75000,
    });
    await invoiceRepo.create(BUSINESS_ID, persist);

    expect(mockTx).toHaveBeenCalledTimes(5);

    const [itemStrings, ...itemValues] = mockTx.mock.calls[2]!;
    expect(Array.from(itemStrings as unknown as string[]).join("")).toContain("INSERT INTO invoice_items");
    expect(itemValues).toContain(PRODUCT_ID);

    const [lockStrings, ...lockValues] = mockTx.mock.calls[3]!;
    const lockText = Array.from(lockStrings as unknown as string[]).join("");
    expect(lockText).toContain("SELECT id FROM products");
    expect(lockText).toContain("FOR UPDATE");
    expect(lockValues).toEqual([PRODUCT_ID, BUSINESS_ID]);

    const [movementStrings, ...movementValues] = mockTx.mock.calls[4]!;
    const movementText = Array.from(movementStrings as unknown as string[]).join("");
    expect(movementText).toContain("INSERT INTO inventory_movements");
    expect(movementText).toContain("'out'");
    expect(movementText).toContain("movement_types");
    expect(movementValues).toContain(3); // item.quantity
  });

  it("throws VALIDATION_ERROR (rolling back the WHOLE transaction, no buildDetail reads) when the guarded movement insert returns ZERO rows (stock overdraw)", async () => {
    const PRODUCT_ID = "80000000-0000-4000-8000-000000000001";
    mockTx
      .mockResolvedValueOnce([{ invoice_type_id: INVOICE_TYPE_ID, seq: 1, prefix: "FAC" }])
      .mockResolvedValueOnce([invoiceRow()])
      .mockResolvedValueOnce([]) // item insert
      .mockResolvedValueOnce([{ id: PRODUCT_ID }]) // product lock (found)
      .mockResolvedValueOnce([]); // guarded movement insert -> 0 rows (overdraw)

    const persist = buildPersist({
      items: [{ description: "Shampoo", quantity: 100, unitPrice: 25000, productId: PRODUCT_ID, lineTotal: 2500000 }],
      subtotal: 2500000,
      total: 2500000,
    });

    await expect(invoiceRepo.create(BUSINESS_ID, persist)).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
    });
    expect(mockSql).not.toHaveBeenCalled();
  });

  it("aborts the WHOLE transaction — nothing read back, nothing fabricated — when an item INSERT rejects", async () => {
    mockTx
      .mockResolvedValueOnce([{ invoice_type_id: INVOICE_TYPE_ID, seq: 1, prefix: "FAC" }])
      .mockResolvedValueOnce([invoiceRow()])
      .mockRejectedValueOnce(new Error("simulated item insert failure"));

    await expect(invoiceRepo.create(BUSINESS_ID, buildPersist())).rejects.toThrow("simulated item insert failure");

    // buildDetail's post-transaction reads never ran — the rejection inside
    // the transaction callback propagates before any read-back happens.
    expect(mockSql).not.toHaveBeenCalled();
  });

  it("propagates the error and fabricates nothing when the transaction itself rejects", async () => {
    mockRunTransaction.mockRejectedValueOnce(new Error("simulated transaction failure"));

    await expect(invoiceRepo.create(BUSINESS_ID, buildPersist())).rejects.toThrow("simulated transaction failure");
    expect(mockSql).not.toHaveBeenCalled();
  });
});
