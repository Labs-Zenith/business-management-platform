import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Mirrors `lib/db/expense-repo.test.ts`'s mocking pattern, extended with a
 * mocked `sql.transaction` — the codebase's FIRST true multi-statement
 * transaction. The critical assertions here are that `create` (a) builds
 * the payroll_payments INSERT and the expenses INSERT with the correct text
 * and interpolated values (not two swapped/duplicated/wrong queries), (b)
 * hands BOTH of those exact query objects to `sql.transaction([...])`
 * together in ONE call — proving the two inserts are NOT executed as two
 * separate, un-transacted `sql` calls — and (c) propagates a rejected
 * transaction cleanly, with nothing fabricated or partially persisted.
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

describe("db payrollRepo.create — atomicity via sql.transaction", () => {
  beforeEach(() => {
    mockSql.mockReset();
    mockSql.transaction.mockReset();
  });

  it("calls sql.transaction ONCE with an array containing BOTH the payroll INSERT and the expense INSERT (not two separate un-transacted sql calls), and each query is built with the correct text and interpolated values", async () => {
    // Configure the mocked `sql` tag to return a distinct, identifiable
    // sentinel per call — this lets us prove BOTH (a) each query's own text
    // and interpolated values are correct, AND (b) the exact same two query
    // objects (not fabricated/duplicated/swapped ones) are what gets handed
    // to `sql.transaction([...])`. Mirrors `lib/db/employee-repo.test.ts`'s
    // `create` test pattern of capturing the tag function's own call
    // arguments (strings + interpolated values).
    mockSql.mockReturnValueOnce("PAYROLL_INSERT_QUERY").mockReturnValueOnce("EXPENSE_INSERT_QUERY");
    mockSql.transaction.mockResolvedValueOnce([[payrollRow()], []]);

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

    // (a) The FIRST sql call must build the payroll_payments INSERT, with
    // the payroll payment's own businessId/employeeId/amount/period fields
    // bound as tagged-template substitution values — not a second expense
    // insert, not swapped values.
    const [payrollStrings, ...payrollValues] = mockSql.mock.calls[0]!;
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

    // (b) The SECOND sql call must build the expenses INSERT, with
    // `category: 'nomina'` and the linked expense's own amount/business_id
    // bound — not a duplicate payroll insert, not swapped values.
    const [expenseStrings, ...expenseValues] = mockSql.mock.calls[1]!;
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

    // (c) ONE call to sql.transaction, containing EXACTLY those same two
    // query objects (identified by their sentinel return values above), in a
    // single array argument, in payroll-then-expense order — proving both
    // inserts are handed to `sql.transaction([...])` together, in one atomic
    // call, NOT as two separate `await sql\`...\`` round-trips, and not some
    // other pair of queries.
    expect(mockSql.transaction).toHaveBeenCalledTimes(1);
    const [queriesArg] = mockSql.transaction.mock.calls[0]!;
    expect(queriesArg).toEqual(["PAYROLL_INSERT_QUERY", "EXPENSE_INSERT_QUERY"]);
  });

  it("propagates the error and returns nothing fabricated when sql.transaction rejects (the failure mode this atomic design exists to guard against)", async () => {
    mockSql.mockReturnValueOnce("PAYROLL_INSERT_QUERY").mockReturnValueOnce("EXPENSE_INSERT_QUERY");
    mockSql.transaction.mockRejectedValueOnce(new Error("simulated transaction failure"));

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
    mockSql.transaction.mockResolvedValueOnce([
      [payrollRow({ amount: 2200000, period_type: "mensual", period_start: "2026-05-01", period_end: "2026-05-31" })],
      [],
    ]);

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
    mockSql.transaction.mockReset();
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
    mockSql.transaction.mockReset();
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
