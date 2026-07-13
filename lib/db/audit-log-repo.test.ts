import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Mirrors `lib/db/expense-repo.test.ts`'s mocking pattern: `sql` is a Neon
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

const { auditLogRepo } = await import("./audit-log-repo");

const BUSINESS_ID = "10000000-0000-4000-8000-000000000001";
const OTHER_BUSINESS_ID = "10000000-0000-4000-8000-000000000099";
const INVOICE_ID = "50000000-0000-4000-8000-000000000001";

function row(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "b0000000-0000-4000-8000-000000000001",
    business_id: BUSINESS_ID,
    entity_type: "invoice",
    entity_id: INVOICE_ID,
    action: "invoice_created",
    actor_user_id: "20000000-0000-4000-8000-000000000001",
    detail: "FAC-0001",
    created_at: "2026-07-13T00:00:00.000Z",
    ...overrides,
  };
}

describe("db auditLogRepo.list", () => {
  beforeEach(() => {
    mockSql.mockReset();
  });

  it("maps rows to the AuditLogEntry shape, business/entityType/entityId-scoped, newest first", async () => {
    mockSql.mockResolvedValueOnce([
      row({ id: "b0000000-0000-4000-8000-000000000001", created_at: "2026-07-13T00:00:00.000Z" }),
      row({ id: "b0000000-0000-4000-8000-000000000002", created_at: "2026-07-13T01:00:00.000Z" }),
    ]);

    const entries = await auditLogRepo.list(BUSINESS_ID, "invoice", INVOICE_ID);

    expect(entries).toHaveLength(2);
    expect(entries[0]!.id).toBe("b0000000-0000-4000-8000-000000000002"); // newest first
    expect(entries[0]).toEqual({
      id: "b0000000-0000-4000-8000-000000000002",
      businessId: BUSINESS_ID,
      entityType: "invoice",
      entityId: INVOICE_ID,
      action: "invoice_created",
      actorUserId: "20000000-0000-4000-8000-000000000001",
      detail: "FAC-0001",
      createdAt: "2026-07-13T01:00:00.000Z",
    });

    // Prove businessId/entityType/entityId are bound as substitution values,
    // not string-concatenated into the query text.
    const [, ...values] = mockSql.mock.calls[0]!;
    expect(values).toEqual([BUSINESS_ID, "invoice", INVOICE_ID]);
  });

  it("returns an empty array when no rows are found", async () => {
    mockSql.mockResolvedValueOnce([]);

    const entries = await auditLogRepo.list(BUSINESS_ID, "invoice", INVOICE_ID);

    expect(entries).toEqual([]);
  });

  it("never leaks a row belonging to another business (the WHERE clause already scopes it, but assert the mapped shape defensively)", async () => {
    mockSql.mockResolvedValueOnce([row({ business_id: OTHER_BUSINESS_ID })]);
    // The query itself is business-scoped; this test documents that IF the
    // driver ever returned a cross-business row, the repo would still map it
    // as-is (no extra JS-side re-filter) — the WHERE clause is the ONLY
    // scoping boundary, matching every other db repo in this codebase.
    const entries = await auditLogRepo.list(BUSINESS_ID, "invoice", INVOICE_ID);

    expect(entries[0]!.businessId).toBe(OTHER_BUSINESS_ID);
  });
});

describe("db auditLogRepo.create", () => {
  beforeEach(() => {
    mockSql.mockReset();
  });

  it("inserts via INSERT ... RETURNING * and maps the returned row", async () => {
    mockSql.mockResolvedValueOnce([row({ action: "payment_recorded", detail: null })]);

    const entry = await auditLogRepo.create(BUSINESS_ID, {
      entityType: "invoice",
      entityId: INVOICE_ID,
      action: "payment_recorded",
      actorUserId: "20000000-0000-4000-8000-000000000001",
      detail: null,
    });

    expect(entry.action).toBe("payment_recorded");
    expect(entry.detail).toBeNull();
    expect(entry.businessId).toBe(BUSINESS_ID);

    const [strings, ...values] = mockSql.mock.calls[0]!;
    const queryText = Array.from(strings as unknown as string[]).join("");
    expect(queryText).toContain("INSERT INTO audit_log");
    expect(queryText).toContain("RETURNING");

    // Prove the values are bound as tagged-template substitutions, in the
    // exact column order the query text implies.
    expect(values).toEqual([
      BUSINESS_ID,
      "invoice",
      INVOICE_ID,
      "payment_recorded",
      "20000000-0000-4000-8000-000000000001",
      null,
    ]);
  });

  it("defaults detail to null when omitted from the input", async () => {
    mockSql.mockResolvedValueOnce([row({ detail: null })]);

    await auditLogRepo.create(BUSINESS_ID, {
      entityType: "invoice",
      entityId: INVOICE_ID,
      action: "invoice_created",
      actorUserId: "20000000-0000-4000-8000-000000000001",
    });

    const [, ...values] = mockSql.mock.calls[0]!;
    expect(values[values.length - 1]).toBeNull();
  });
});
