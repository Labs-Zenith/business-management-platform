import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Mirrors `lib/db/business-repo.test.ts`'s mocking pattern: `sql` is a Neon
 * tagged-template function, so mocking it as a `vi.fn()` and controlling its
 * resolved value is sufficient — no real Postgres connection is ever made.
 */
const { mockSql } = vi.hoisted(() => ({
  mockSql: vi.fn(),
}));

vi.mock("./client", () => ({
  sql: mockSql,
  isDbConfigured: true,
}));

const { expenseRepo } = await import("./expense-repo");

const BUSINESS_ID = "10000000-0000-4000-8000-000000000001";
const OTHER_BUSINESS_ID = "10000000-0000-4000-8000-000000000099";

function row(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "60000000-0000-4000-8000-000000000001",
    business_id: BUSINESS_ID,
    category: "otro",
    expense_date: "2026-07-01",
    description: "Papeleria",
    amount: 50000,
    notes: null,
    created_at: "2026-07-01T00:00:00.000Z",
    updated_at: "2026-07-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("db expenseRepo.getById", () => {
  beforeEach(() => {
    mockSql.mockReset();
  });

  it("maps a row to the Expense shape when it belongs to the requesting business", async () => {
    mockSql.mockResolvedValueOnce([row()]);

    const expense = await expenseRepo.getById(BUSINESS_ID, "60000000-0000-4000-8000-000000000001");

    expect(expense).toEqual({
      id: "60000000-0000-4000-8000-000000000001",
      businessId: BUSINESS_ID,
      category: "otro",
      expenseDate: "2026-07-01",
      description: "Papeleria",
      amount: 50000,
      notes: null,
      createdAt: "2026-07-01T00:00:00.000Z",
      updatedAt: "2026-07-01T00:00:00.000Z",
    });

    // Prove the requested id is actually bound as a tagged-template
    // substitution value, not string-concatenated into the query text.
    const [, ...values] = mockSql.mock.calls[0]!;
    expect(values).toEqual(["60000000-0000-4000-8000-000000000001"]);
  });

  it("returns null (not a leaked record) when the row belongs to a different business", async () => {
    mockSql.mockResolvedValueOnce([row({ business_id: OTHER_BUSINESS_ID })]);

    const expense = await expenseRepo.getById(BUSINESS_ID, "60000000-0000-4000-8000-000000000001");

    expect(expense).toBeNull();
  });

  it("returns null when no row is found", async () => {
    mockSql.mockResolvedValueOnce([]);

    const expense = await expenseRepo.getById(BUSINESS_ID, "00000000-0000-4000-8000-000000000000");

    expect(expense).toBeNull();
  });
});

describe("db expenseRepo.list", () => {
  beforeEach(() => {
    mockSql.mockReset();
  });

  it("filters by category, from, and to in JS after a single business-scoped fetch", async () => {
    mockSql.mockResolvedValueOnce([
      row({ id: "60000000-0000-4000-8000-000000000001", category: "nomina", expense_date: "2026-07-10" }),
      row({ id: "60000000-0000-4000-8000-000000000002", category: "otro", expense_date: "2026-07-15" }),
      row({ id: "60000000-0000-4000-8000-000000000003", category: "nomina", expense_date: "2026-06-01" }),
    ]);

    const result = await expenseRepo.list(BUSINESS_ID, {
      page: 1,
      pageSize: 20,
      category: "nomina",
      from: "2026-07-01",
      to: "2026-07-31",
    });

    expect(result.total).toBe(1);
    expect(result.data[0]!.id).toBe("60000000-0000-4000-8000-000000000001");

    // Prove businessId is bound as a substitution value, not concatenated.
    const [, ...values] = mockSql.mock.calls[0]!;
    expect(values).toEqual([BUSINESS_ID]);
  });

  it("includes rows whose expenseDate exactly equals from or to (inclusive range)", async () => {
    mockSql.mockResolvedValueOnce([
      row({ id: "60000000-0000-4000-8000-000000000001", expense_date: "2026-07-01" }),
      row({ id: "60000000-0000-4000-8000-000000000002", expense_date: "2026-07-31" }),
      row({ id: "60000000-0000-4000-8000-000000000003", expense_date: "2026-06-30" }),
      row({ id: "60000000-0000-4000-8000-000000000004", expense_date: "2026-08-01" }),
    ]);

    const result = await expenseRepo.list(BUSINESS_ID, {
      page: 1,
      pageSize: 20,
      from: "2026-07-01",
      to: "2026-07-31",
    });

    expect(result.data.map((e) => e.id).sort()).toEqual([
      "60000000-0000-4000-8000-000000000001",
      "60000000-0000-4000-8000-000000000002",
    ]);
  });

  it("returns an empty page when requesting a page beyond the last page, with total still reflecting the real count", async () => {
    mockSql.mockResolvedValueOnce([
      row({ id: "60000000-0000-4000-8000-000000000001" }),
      row({ id: "60000000-0000-4000-8000-000000000002" }),
    ]);

    const result = await expenseRepo.list(BUSINESS_ID, { page: 5, pageSize: 2 });

    expect(result.data).toEqual([]);
    expect(result.total).toBe(2);
  });

  it("sorts newest first and paginates", async () => {
    mockSql.mockResolvedValueOnce([
      row({ id: "60000000-0000-4000-8000-000000000001", expense_date: "2026-07-01" }),
      row({ id: "60000000-0000-4000-8000-000000000002", expense_date: "2026-07-20" }),
      row({ id: "60000000-0000-4000-8000-000000000003", expense_date: "2026-07-10" }),
    ]);

    const result = await expenseRepo.list(BUSINESS_ID, { page: 1, pageSize: 2 });

    expect(result.total).toBe(3);
    expect(result.data.map((e) => e.id)).toEqual([
      "60000000-0000-4000-8000-000000000002",
      "60000000-0000-4000-8000-000000000003",
    ]);
  });
});

describe("db expenseRepo.create", () => {
  beforeEach(() => {
    mockSql.mockReset();
  });

  it("inserts via INSERT ... RETURNING * and maps the returned row", async () => {
    mockSql.mockResolvedValueOnce([row({ description: "Nuevo gasto", amount: 75000 })]);

    const expense = await expenseRepo.create(BUSINESS_ID, {
      category: "otro",
      expenseDate: "2026-07-01",
      description: "Nuevo gasto",
      amount: 75000,
      notes: null,
    });

    expect(expense.description).toBe("Nuevo gasto");
    expect(expense.amount).toBe(75000);
    expect(expense.businessId).toBe(BUSINESS_ID);

    const [strings, ...values] = mockSql.mock.calls[0]!;
    const queryText = Array.from(strings as unknown as string[]).join("");
    expect(queryText).toContain("INSERT INTO expenses");
    expect(queryText).toContain("RETURNING");

    // Prove the values are bound as tagged-template substitutions, in the
    // exact column order the query text implies — not string-concatenated
    // into the SQL text (which would make this test pass unchanged even if
    // a future regression introduced injection or reordered a column).
    expect(values).toEqual([BUSINESS_ID, "otro", "2026-07-01", "Nuevo gasto", 75000, null]);
  });
});
