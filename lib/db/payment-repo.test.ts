import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Mirrors `lib/db/inventory-repo.test.ts`'s / `lib/db/invoice-repo.test.ts`'s
 * mock shape: `createForInvoice` now runs a TWO-STATEMENT `sql.transaction`
 * ([statement 1] `SELECT ... FOR UPDATE` locks the invoice row, [statement 2]
 * the existing balance-CTE `INSERT`) — see the repo's file-level doc comment
 * for the full empirical methodology proving why a bare `FOR UPDATE` added
 * only to the single CTE is insufficient once invoice EDITING exists as a
 * concurrent writer on the same row (`invoice-repo.ts#update`).
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

vi.mock("./invoice-repo", () => ({
  invoiceRepo: {
    getById: vi.fn(),
  },
}));

const { paymentRepo } = await import("./payment-repo");
const { invoiceRepo } = await import("./invoice-repo");

const BUSINESS_ID = "10000000-0000-4000-8000-000000000001";
const INVOICE_ID = "50000000-0000-4000-8000-000000000001";
const CUSTOMER_ID = "40000000-0000-4000-8000-000000000001";

function paymentInput(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    paymentDate: "2026-07-08",
    amount: 40000,
    method: "cash",
    notes: null,
    ...overrides,
  };
}

describe("db paymentRepo.createForInvoice — overpay guard against a concurrent edit (safety-critical)", () => {
  beforeEach(() => {
    mockSql.mockReset();
    mockSql.transaction.mockReset();
    vi.mocked(invoiceRepo.getById).mockReset();
  });

  it("throws NOT_FOUND when statement 1 (FOR UPDATE lock) matches no invoice row for this business, and inserts nothing", async () => {
    mockSql.mockReturnValueOnce("LOCK_QUERY").mockReturnValueOnce("INSERT_QUERY");
    mockSql.transaction.mockResolvedValueOnce([[], []]);

    await expect(paymentRepo.createForInvoice(BUSINESS_ID, INVOICE_ID, paymentInput())).rejects.toMatchObject({
      code: "NOT_FOUND",
    });

    expect(mockSql.transaction).toHaveBeenCalledTimes(1);
    const [queriesArg] = mockSql.transaction.mock.calls[0]!;
    expect(queriesArg).toEqual(["LOCK_QUERY", "INSERT_QUERY"]);
    expect(invoiceRepo.getById).not.toHaveBeenCalled();
  });

  it("throws VALIDATION_ERROR (not NOT_FOUND) when statement 1 found the invoice but statement 2's balance guard excluded the insert — zero mutation", async () => {
    mockSql.mockReturnValueOnce("LOCK_QUERY").mockReturnValueOnce("INSERT_QUERY");
    mockSql.transaction.mockResolvedValueOnce([[{ id: INVOICE_ID, customer_id: CUSTOMER_ID }], []]);

    await expect(
      paymentRepo.createForInvoice(BUSINESS_ID, INVOICE_ID, paymentInput({ amount: 999999 })),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });

    expect(mockSql.transaction).toHaveBeenCalledTimes(1);
    expect(invoiceRepo.getById).not.toHaveBeenCalled();
  });

  it("hands BOTH statements to sql.transaction in one call — statement 1 SELECT ... FOR UPDATE (lock) then statement 2 the balance-CTE INSERT — with correct text, and does NOT re-take FOR UPDATE in statement 2", async () => {
    mockSql.mockReturnValueOnce("LOCK_QUERY").mockReturnValueOnce("INSERT_QUERY");
    mockSql.transaction.mockResolvedValueOnce([
      [{ id: INVOICE_ID, customer_id: CUSTOMER_ID }],
      [{ id: "70000000-0000-4000-8000-000000000001" }],
    ]);
    vi.mocked(invoiceRepo.getById).mockResolvedValueOnce({ id: INVOICE_ID } as never);

    const detail = await paymentRepo.createForInvoice(BUSINESS_ID, INVOICE_ID, paymentInput());

    expect(detail).toEqual({ id: INVOICE_ID });

    // Statement 1: locks the invoice row, scoped to id + business_id.
    const [lockStrings, ...lockValues] = mockSql.mock.calls[0]!;
    const lockText = Array.from(lockStrings as unknown as string[]).join("");
    expect(lockText).toContain("SELECT id, customer_id FROM invoices");
    expect(lockText).toContain("FOR UPDATE");
    expect(lockText).not.toContain("INSERT"); // the lock statement never writes
    expect(lockValues).toEqual([INVOICE_ID, BUSINESS_ID]);

    // Statement 2: balance CTE + conditional INSERT — does NOT re-take a FOR
    // UPDATE (statement 1 is the sole lock holder; see the repo doc comment
    // on the EvalPlanQual stale-subquery hazard this avoids).
    const [insStrings, ...insValues] = mockSql.mock.calls[1]!;
    const insText = Array.from(insStrings as unknown as string[]).join("");
    expect(insText).toContain("INSERT INTO payments");
    expect(insText).toContain("RETURNING");
    expect(insText).toContain("balance");
    expect(insText).not.toContain("FOR UPDATE");
    // Boundary guard is `<=` (an exact full payment must succeed), NOT `<`.
    expect(insText).toContain("<= bal.balance");
    // Statement 2's INTERPOLATED VALUES, in order, must be correct — not just
    // the SQL text (this closes the weak-assertion gap that masked a real bug
    // in `payroll-repo.test.ts` earlier). Interpolation order matches the SQL:
    // bal.WHERE(invoiceId, businessId), SELECT(businessId, paymentDate, amount,
    // method, notes), then the `${amount} <= bal.balance` guard.
    const input = paymentInput();
    expect(insValues).toEqual([
      INVOICE_ID, // bal AS ... WHERE i.id
      BUSINESS_ID, // bal AS ... AND i.business_id
      BUSINESS_ID, // SELECT ... business_id
      input.paymentDate,
      input.amount,
      input.method,
      input.notes,
      input.amount, // WHERE ${amount} <= bal.balance
    ]);

    expect(mockSql.transaction).toHaveBeenCalledTimes(1);
    const [queriesArg] = mockSql.transaction.mock.calls[0]!;
    expect(queriesArg).toEqual(["LOCK_QUERY", "INSERT_QUERY"]);

    expect(invoiceRepo.getById).toHaveBeenCalledWith(BUSINESS_ID, INVOICE_ID);
  });

  it("accepts a payment whose amount EXACTLY equals the remaining balance (the `<=` boundary), interpolating that amount into the guard, not rejecting it as an overpay", async () => {
    // Exact-boundary case: statement 2's `WHERE ${amount} <= bal.balance`
    // admits an amount equal to the balance (Postgres evaluates the guard),
    // so the transaction returns a non-empty insert and the payment succeeds.
    // This proves the boundary is `<=`, not an accidental `<` that would
    // reject a full/exact payment.
    const EXACT_BALANCE = 60000;
    mockSql.mockReturnValueOnce("LOCK_QUERY").mockReturnValueOnce("INSERT_QUERY");
    mockSql.transaction.mockResolvedValueOnce([
      [{ id: INVOICE_ID, customer_id: CUSTOMER_ID }],
      [{ id: "70000000-0000-4000-8000-000000000002" }],
    ]);
    vi.mocked(invoiceRepo.getById).mockResolvedValueOnce({ id: INVOICE_ID } as never);

    const detail = await paymentRepo.createForInvoice(
      BUSINESS_ID,
      INVOICE_ID,
      paymentInput({ amount: EXACT_BALANCE }),
    );

    expect(detail).toEqual({ id: INVOICE_ID });
    const [insStrings, ...insValues] = mockSql.mock.calls[1]!;
    expect(Array.from(insStrings as unknown as string[]).join("")).toContain("<= bal.balance");
    // The exact amount is interpolated both in the SELECT and in the guard.
    expect(insValues[4]).toBe(EXACT_BALANCE);
    expect(insValues[7]).toBe(EXACT_BALANCE);
  });

  it("throws NOT_FOUND if the post-insert detail lookup somehow resolves null (defensive, should not normally happen)", async () => {
    mockSql.mockReturnValueOnce("LOCK_QUERY").mockReturnValueOnce("INSERT_QUERY");
    mockSql.transaction.mockResolvedValueOnce([
      [{ id: INVOICE_ID, customer_id: CUSTOMER_ID }],
      [{ id: "70000000-0000-4000-8000-000000000001" }],
    ]);
    vi.mocked(invoiceRepo.getById).mockResolvedValueOnce(null);

    await expect(paymentRepo.createForInvoice(BUSINESS_ID, INVOICE_ID, paymentInput())).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("propagates the error and fabricates nothing when sql.transaction rejects", async () => {
    mockSql.mockReturnValueOnce("LOCK_QUERY").mockReturnValueOnce("INSERT_QUERY");
    mockSql.transaction.mockRejectedValueOnce(new Error("simulated transaction failure"));

    await expect(paymentRepo.createForInvoice(BUSINESS_ID, INVOICE_ID, paymentInput())).rejects.toThrow(
      "simulated transaction failure",
    );
  });
});
