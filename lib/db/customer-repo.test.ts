import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Scoped to `delete` only — the rest of `customerRepo` (list/getById/create/
 * update) is plain fetch-and-map with no branching worth a db-layer unit
 * test, and is already exercised through `lib/mock/customer-repo.test.ts` and
 * the route tests. `delete` is different: it is the repo's only transactional
 * writer and its guard decides whether financial history survives.
 *
 * Same mocking pattern as `lib/db/pipeline-repo.test.ts`: `sql`/`tx` are
 * postgres.js tagged-template functions mocked as `vi.fn()` with controlled
 * resolved values — no real Postgres connection is made. Assertions are on
 * the EMITTED SQL TEXT because statement ORDER is the contract (lock first,
 * so the reference count cannot go stale before the delete commits).
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

const { customerRepo } = await import("./customer-repo");

const BUSINESS_ID = "10000000-0000-4000-8000-000000000001";
const OTHER_BUSINESS_ID = "10000000-0000-4000-8000-000000000099";
const CUSTOMER_ID = "20000000-0000-4000-8000-000000000001";

function queryTextAt(callIndex: number): string {
  const [strings] = mockTx.mock.calls[callIndex]!;
  return Array.from(strings as unknown as string[]).join("");
}

describe("db customerRepo.delete", () => {
  beforeEach(() => {
    mockSql.mockReset();
    mockTx.mockReset();
    mockRunTransaction.mockReset();
    mockRunTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(mockTx));
  });

  it("deletes in ONE transaction when nothing references the customer, detaching pipeline cards first", async () => {
    mockTx
      .mockResolvedValueOnce([{ id: CUSTOMER_ID }]) // FOR UPDATE lock
      .mockResolvedValueOnce([{ invoice_count: 0, payment_count: 0 }]) // reference counts
      .mockResolvedValueOnce([]) // UPDATE pipeline_cards
      .mockResolvedValueOnce([]); // DELETE customers

    const result = await customerRepo.delete(BUSINESS_ID, CUSTOMER_ID);

    expect(result).toEqual({ outcome: "deleted" });
    expect(mockRunTransaction).toHaveBeenCalledTimes(1);
    expect(mockTx).toHaveBeenCalledTimes(4);
    expect(queryTextAt(0)).toContain("FOR UPDATE");
    expect(queryTextAt(0)).toContain("FROM customers");
    expect(queryTextAt(1)).toContain("FROM invoices");
    expect(queryTextAt(1)).toContain("FROM payments");
    // The nullable FK is detached BEFORE the delete, or the delete would trip
    // the FK. Order matters, so assert it explicitly.
    expect(queryTextAt(2)).toContain("UPDATE pipeline_cards");
    expect(queryTextAt(2)).toContain("customer_id = NULL");
    expect(queryTextAt(3)).toContain("DELETE FROM customers");
  });

  it("refuses with the invoice count and issues NO mutation when invoices reference the customer", async () => {
    mockTx
      .mockResolvedValueOnce([{ id: CUSTOMER_ID }])
      .mockResolvedValueOnce([{ invoice_count: 3, payment_count: 0 }]);

    const result = await customerRepo.delete(BUSINESS_ID, CUSTOMER_ID);

    expect(result).toEqual({ outcome: "conflict", invoiceCount: 3, paymentCount: 0 });
    // Lock + count only: no UPDATE, no DELETE.
    expect(mockTx).toHaveBeenCalledTimes(2);
  });

  it("refuses when only payments reference the customer", async () => {
    mockTx
      .mockResolvedValueOnce([{ id: CUSTOMER_ID }])
      .mockResolvedValueOnce([{ invoice_count: 0, payment_count: 2 }]);

    const result = await customerRepo.delete(BUSINESS_ID, CUSTOMER_ID);

    expect(result).toEqual({ outcome: "conflict", invoiceCount: 0, paymentCount: 2 });
    expect(mockTx).toHaveBeenCalledTimes(2);
  });

  it("coerces string counts from the driver to numbers", async () => {
    // postgres.js can hand back COUNT as a string depending on the type
    // parser; the repo's `Number(...)` must survive that or `> 0` would be
    // comparing a string.
    mockTx
      .mockResolvedValueOnce([{ id: CUSTOMER_ID }])
      .mockResolvedValueOnce([{ invoice_count: "1", payment_count: "0" }]);

    const result = await customerRepo.delete(BUSINESS_ID, CUSTOMER_ID);

    expect(result).toEqual({ outcome: "conflict", invoiceCount: 1, paymentCount: 0 });
  });

  it("returns not_found and issues NO further statement when the lock finds nothing", async () => {
    mockTx.mockResolvedValueOnce([]);

    const result = await customerRepo.delete(OTHER_BUSINESS_ID, CUSTOMER_ID);

    expect(result).toEqual({ outcome: "not_found" });
    expect(mockTx).toHaveBeenCalledTimes(1);
  });

  it("scopes the lock to the requesting business", async () => {
    mockTx.mockResolvedValueOnce([]);

    await customerRepo.delete(BUSINESS_ID, CUSTOMER_ID);

    const [, ...values] = mockTx.mock.calls[0]!;
    expect(values).toContain(BUSINESS_ID);
    expect(values).toContain(CUSTOMER_ID);
  });
});
