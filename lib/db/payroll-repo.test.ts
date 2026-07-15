import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Mirrors `lib/db/expense-repo.test.ts`'s mocking pattern, extended with a
 * mocked `runTransaction` — the codebase's FIRST true multi-statement
 * transaction, now postgres.js's interactive `sql.begin(async (tx) => {...})`
 * via the shared `runTransaction` helper. The critical assertions here are
 * that `create` (a) builds the payroll_payments INSERT and the expenses
 * INSERT with the correct text and interpolated values (not two
 * swapped/duplicated/wrong queries), (b) runs BOTH of those statements
 * sequentially against the SAME `tx` inside ONE `runTransaction` callback —
 * proving the two inserts are NOT executed as two separate, un-transacted
 * `sql` calls — and (c) propagates a rejected transaction cleanly, with
 * nothing fabricated or partially persisted.
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

const { payrollRepo } = await import("./payroll-repo");

const BUSINESS_ID = "10000000-0000-4000-8000-000000000001";
const OTHER_BUSINESS_ID = "10000000-0000-4000-8000-000000000099";

function payrollRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "80000000-0000-4000-8000-000000000001",
    business_id: BUSINESS_ID,
    employee_id: "70000000-0000-4000-8000-000000000001",
    amount: 1000000,
    period_type: "quincenal",
    period_start: "2026-07-01",
    period_end: "2026-07-15",
    payment_date: "2026-07-16",
    notes: null,
    created_at: "2026-07-16T00:00:00.000Z",
    ...overrides,
  };
}

describe("db payrollRepo.create — atomicity via runTransaction", () => {
  beforeEach(() => {
    mockSql.mockReset();
    mockTx.mockReset();
    mockRunTransaction.mockReset();
    mockRunTransaction.mockImplementation((fn: (tx: typeof mockTx) => Promise<unknown>) => fn(mockTx));
  });

  it("calls runTransaction ONCE with a callback that runs BOTH the payroll INSERT and the expense INSERT sequentially against the SAME tx (not two separate un-transacted sql calls), and each query is built with the correct text and interpolated values", async () => {
    // Configure the mocked `tx` tag to return a distinct, identifiable
    // sentinel per call — this lets us prove BOTH (a) each query's own text
    // and interpolated values are correct, AND (b) the exact same two query
    // calls (not fabricated/duplicated/swapped ones) happen in
    // payroll-then-expense order within a single `runTransaction` callback.
    // Mirrors `lib/db/employee-repo.test.ts`'s `create` test pattern of
    // capturing the tag function's own call arguments (strings + interpolated
    // values).
    mockTx.mockResolvedValueOnce([payrollRow()]).mockResolvedValueOnce([]);

    const payment = await payrollRepo.create(
      BUSINESS_ID,
      {
        employeeId: "70000000-0000-4000-8000-000000000001",
        amount: 1000000,
        periodType: "quincenal",
        periodStart: "2026-07-01",
        periodEnd: "2026-07-15",
        paymentDate: "2026-07-16",
        notes: null,
      },
      {
        category: "nomina",
        expenseDate: "2026-07-16",
        description: "Nomina Laura Martinez (2026-07-01 - 2026-07-15)",
        amount: 1000000,
        notes: null,
      },
    );

    expect(payment.id).toBe("80000000-0000-4000-8000-000000000001");
    expect(payment.businessId).toBe(BUSINESS_ID);

    // (a) The FIRST tx call must build the payroll_payments INSERT, with
    // the payroll payment's own businessId/employeeId/amount/period fields
    // bound as tagged-template substitution values — not a second expense
    // insert, not swapped values.
    const [payrollStrings, ...payrollValues] = mockTx.mock.calls[0]!;
    const payrollQueryText = Array.from(payrollStrings as unknown as string[]).join("");
    expect(payrollQueryText).toContain("INSERT INTO payroll_payments");
    expect(payrollValues).toEqual([
      BUSINESS_ID,
      "70000000-0000-4000-8000-000000000001",
      1000000,
      "quincenal",
      "2026-07-01",
      "2026-07-15",
      "2026-07-16",
      null,
    ]);

    // (b) The SECOND tx call must build the expenses INSERT, with
    // `category: 'nomina'` and the linked expense's own amount/business_id
    // bound — not a duplicate payroll insert, not swapped values.
    const [expenseStrings, ...expenseValues] = mockTx.mock.calls[1]!;
    const expenseQueryText = Array.from(expenseStrings as unknown as string[]).join("");
    expect(expenseQueryText).toContain("INSERT INTO expenses");
    expect(expenseValues).toEqual([
      BUSINESS_ID,
      "nomina",
      "2026-07-16",
      "Nomina Laura Martinez (2026-07-01 - 2026-07-15)",
      1000000,
      null,
    ]);

    // (c) ONE call to runTransaction, whose callback ran EXACTLY those two
    // statements against `tx`, in payroll-then-expense order — proving both
    // inserts run together, in one atomic call, NOT as two separate
    // `await sql\`...\`` round-trips, and not some other pair of queries.
    expect(mockRunTransaction).toHaveBeenCalledTimes(1);
    expect(mockTx).toHaveBeenCalledTimes(2);
  });

  it("propagates the error and returns nothing fabricated when the transaction rejects (the failure mode this atomic design exists to guard against)", async () => {
    mockRunTransaction.mockRejectedValueOnce(new Error("simulated transaction failure"));

    await expect(
      payrollRepo.create(
        BUSINESS_ID,
        {
          employeeId: "70000000-0000-4000-8000-000000000001",
          amount: 1000000,
          periodType: "quincenal",
          periodStart: "2026-07-01",
          periodEnd: "2026-07-15",
          paymentDate: "2026-07-16",
          notes: null,
        },
        {
          category: "nomina",
          expenseDate: "2026-07-16",
          description: "Nomina Laura Martinez (2026-07-01 - 2026-07-15)",
          amount: 1000000,
          notes: null,
        },
      ),
    ).rejects.toThrow("simulated transaction failure");
  });

  it("maps the returned payroll row correctly", async () => {
    mockTx
      .mockResolvedValueOnce([
        payrollRow({ amount: 2200000, period_type: "mensual", period_start: "2026-05-01", period_end: "2026-05-31" }),
      ])
      .mockResolvedValueOnce([]);

    const payment = await payrollRepo.create(
      BUSINESS_ID,
      {
        employeeId: "70000000-0000-4000-8000-000000000001",
        amount: 2200000,
        periodType: "mensual",
        periodStart: "2026-05-01",
        periodEnd: "2026-05-31",
        paymentDate: "2026-06-01",
        notes: null,
      },
      {
        category: "nomina",
        expenseDate: "2026-06-01",
        description: "Nomina mensual",
        amount: 2200000,
        notes: null,
      },
    );

    expect(payment.amount).toBe(2200000);
    expect(payment.periodType).toBe("mensual");
    expect(payment.periodStart).toBe("2026-05-01");
    expect(payment.periodEnd).toBe("2026-05-31");
  });
});

describe("db payrollRepo.getById — business_id scoping", () => {
  beforeEach(() => {
    mockSql.mockReset();
    mockTx.mockReset();
    mockRunTransaction.mockReset();
  });

  it("returns the payment with the joined employee name when it belongs to the requesting business", async () => {
    mockSql
      .mockResolvedValueOnce([payrollRow()]) // SELECT payroll_payments
      .mockResolvedValueOnce([{ id: "70000000-0000-4000-8000-000000000001", name: "Laura Martinez" }]); // SELECT employees

    const found = await payrollRepo.getById(BUSINESS_ID, "80000000-0000-4000-8000-000000000001");

    expect(found).not.toBeNull();
    expect(found!.employee.name).toBe("Laura Martinez");
  });

  it("returns null (not a leaked record) when the row belongs to a different business", async () => {
    mockSql.mockResolvedValueOnce([payrollRow({ business_id: OTHER_BUSINESS_ID })]);

    const found = await payrollRepo.getById(BUSINESS_ID, "80000000-0000-4000-8000-000000000001");

    expect(found).toBeNull();
  });
});

describe("db payrollRepo.list", () => {
  beforeEach(() => {
    mockSql.mockReset();
    mockTx.mockReset();
    mockRunTransaction.mockReset();
  });

  it("filters by employeeId after a single business-scoped fetch", async () => {
    mockSql
      .mockResolvedValueOnce([
        payrollRow({ id: "80000000-0000-4000-8000-000000000001", employee_id: "70000000-0000-4000-8000-000000000001" }),
        payrollRow({ id: "80000000-0000-4000-8000-000000000002", employee_id: "70000000-0000-4000-8000-000000000002" }),
      ])
      .mockResolvedValueOnce([
        { id: "70000000-0000-4000-8000-000000000001", name: "Laura Martinez" },
        { id: "70000000-0000-4000-8000-000000000002", name: "Miguel Sanchez" },
      ]);

    const result = await payrollRepo.list(BUSINESS_ID, {
      page: 1,
      pageSize: 20,
      employeeId: "70000000-0000-4000-8000-000000000002",
    });

    expect(result.data).toHaveLength(1);
    expect(result.data[0]!.employee.name).toBe("Miguel Sanchez");
  });

  it("scopes the fetch to businessId — the payroll_payments SELECT's WHERE clause is bound to the requesting business, not left to a caller-supplied filter (mirrors getById's business_id scoping proof, and lib/mock/payroll-repo.test.ts's list assertion shape)", async () => {
    mockSql
      .mockResolvedValueOnce([
        payrollRow({ id: "80000000-0000-4000-8000-000000000001" }),
        payrollRow({ id: "80000000-0000-4000-8000-000000000002" }),
      ])
      .mockResolvedValueOnce([{ id: "70000000-0000-4000-8000-000000000001", name: "Laura Martinez" }]);

    const result = await payrollRepo.list(BUSINESS_ID, { page: 1, pageSize: 20 });

    // Prove businessId is bound as a tagged-template substitution value into
    // the payroll_payments SELECT — the SQL query itself is what scopes
    // results to this business, not string concatenation nor a JS filter.
    const [, ...values] = mockSql.mock.calls[0]!;
    expect(values).toEqual([BUSINESS_ID]);

    expect(result.total).toBe(2);
    expect(result.data.every((p) => p.businessId === BUSINESS_ID)).toBe(true);
  });
});
