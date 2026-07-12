import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Mirrors `lib/db/customer-repo.test.ts`/`expense-repo.test.ts`'s mocking
 * pattern: `sql` is a Neon tagged-template function, mocked as `vi.fn()`
 * with controlled resolved values — no real Postgres connection is made.
 */
const { mockSql } = vi.hoisted(() => ({
  mockSql: vi.fn(),
}));

vi.mock("./client", () => ({
  sql: mockSql,
  isDbConfigured: true,
}));

const { employeeRepo } = await import("./employee-repo");

const BUSINESS_ID = "10000000-0000-4000-8000-000000000001";
const OTHER_BUSINESS_ID = "10000000-0000-4000-8000-000000000099";

function row(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "70000000-0000-4000-8000-000000000001",
    business_id: BUSINESS_ID,
    name: "Laura Martinez",
    base_salary: 2000000,
    active: true,
    created_at: "2026-07-01T00:00:00.000Z",
    updated_at: "2026-07-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("db employeeRepo.getById", () => {
  beforeEach(() => {
    mockSql.mockReset();
  });

  it("maps a row to the Employee shape when it belongs to the requesting business", async () => {
    mockSql.mockResolvedValueOnce([row()]);

    const employee = await employeeRepo.getById(BUSINESS_ID, "70000000-0000-4000-8000-000000000001");

    expect(employee).toEqual({
      id: "70000000-0000-4000-8000-000000000001",
      businessId: BUSINESS_ID,
      name: "Laura Martinez",
      baseSalary: 2000000,
      active: true,
      createdAt: "2026-07-01T00:00:00.000Z",
      updatedAt: "2026-07-01T00:00:00.000Z",
    });
  });

  it("returns null (not a leaked record) when the row belongs to a different business", async () => {
    mockSql.mockResolvedValueOnce([row({ business_id: OTHER_BUSINESS_ID })]);

    const employee = await employeeRepo.getById(BUSINESS_ID, "70000000-0000-4000-8000-000000000001");

    expect(employee).toBeNull();
  });

  it("returns null when no row is found", async () => {
    mockSql.mockResolvedValueOnce([]);

    const employee = await employeeRepo.getById(BUSINESS_ID, "00000000-0000-4000-8000-000000000000");

    expect(employee).toBeNull();
  });
});

describe("db employeeRepo.create", () => {
  beforeEach(() => {
    mockSql.mockReset();
  });

  it("inserts via INSERT ... RETURNING * with active hardcoded true, and maps the returned row", async () => {
    mockSql.mockResolvedValueOnce([row({ name: "Nuevo Empleado", base_salary: 1800000 })]);

    const employee = await employeeRepo.create(BUSINESS_ID, { name: "Nuevo Empleado", baseSalary: 1800000 });

    expect(employee.name).toBe("Nuevo Empleado");
    expect(employee.baseSalary).toBe(1800000);
    expect(employee.active).toBe(true);

    const [strings, ...values] = mockSql.mock.calls[0]!;
    const queryText = Array.from(strings as unknown as string[]).join("");
    expect(queryText).toContain("INSERT INTO employees");
    expect(queryText).toContain("RETURNING");
    expect(values).toEqual([BUSINESS_ID, "Nuevo Empleado", 1800000]);
  });
});

describe("db employeeRepo.update", () => {
  beforeEach(() => {
    mockSql.mockReset();
  });

  it("applies name/baseSalary/active updates", async () => {
    mockSql
      .mockResolvedValueOnce([row()]) // SELECT existing
      .mockResolvedValueOnce([row({ name: "Laura M.", base_salary: 2100000, active: false })]); // UPDATE ... RETURNING

    const updated = await employeeRepo.update(BUSINESS_ID, "70000000-0000-4000-8000-000000000001", {
      name: "Laura M.",
      baseSalary: 2100000,
      active: false,
    });

    expect(updated).not.toBeNull();
    expect(updated!.name).toBe("Laura M.");
    expect(updated!.baseSalary).toBe(2100000);
    expect(updated!.active).toBe(false);
  });

  it("returns null for a cross-business update attempt without issuing an UPDATE", async () => {
    mockSql.mockResolvedValueOnce([row({ business_id: OTHER_BUSINESS_ID })]);

    const result = await employeeRepo.update(BUSINESS_ID, "70000000-0000-4000-8000-000000000001", {
      name: "Hijacked",
    });

    expect(result).toBeNull();
    expect(mockSql).toHaveBeenCalledTimes(1); // only the SELECT, no UPDATE issued
  });
});
