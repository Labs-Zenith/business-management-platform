import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Mirrors `lib/db/employee-repo.test.ts`'s mocking pattern: `sql` is a
 * postgres.js tagged-template function, mocked as `vi.fn()` with controlled
 * resolved values — no real Postgres connection is made.
 */
const { mockSql } = vi.hoisted(() => ({
  mockSql: vi.fn(),
}));

vi.mock("./client", () => ({
  sql: mockSql,
  isDbConfigured: true,
}));

const { pipelineRepo } = await import("./pipeline-repo");

const BUSINESS_ID = "10000000-0000-4000-8000-000000000001";
const OTHER_BUSINESS_ID = "10000000-0000-4000-8000-000000000099";

function row(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "70000000-0000-4000-8000-000000000001",
    business_id: BUSINESS_ID,
    customer_id: null,
    title: "Venta de prueba",
    stage: "nuevo",
    amount: 500000,
    notes: null,
    position: 0,
    created_at: "2026-07-01T00:00:00.000Z",
    updated_at: "2026-07-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("db pipelineRepo.getById", () => {
  beforeEach(() => {
    mockSql.mockReset();
  });

  it("maps a row to the PipelineCard shape when it belongs to the requesting business", async () => {
    mockSql.mockResolvedValueOnce([row()]);

    const card = await pipelineRepo.getById(BUSINESS_ID, "70000000-0000-4000-8000-000000000001");

    expect(card).toEqual({
      id: "70000000-0000-4000-8000-000000000001",
      businessId: BUSINESS_ID,
      customerId: null,
      title: "Venta de prueba",
      stage: "nuevo",
      amount: 500000,
      notes: null,
      position: 0,
      createdAt: "2026-07-01T00:00:00.000Z",
      updatedAt: "2026-07-01T00:00:00.000Z",
    });
  });

  it("returns null (not a leaked record) when the row belongs to a different business", async () => {
    mockSql.mockResolvedValueOnce([row({ business_id: OTHER_BUSINESS_ID })]);

    const card = await pipelineRepo.getById(BUSINESS_ID, "70000000-0000-4000-8000-000000000001");

    expect(card).toBeNull();
  });

  it("returns null when no row is found", async () => {
    mockSql.mockResolvedValueOnce([]);

    const card = await pipelineRepo.getById(BUSINESS_ID, "00000000-0000-4000-8000-000000000000");

    expect(card).toBeNull();
  });
});

describe("db pipelineRepo.create", () => {
  beforeEach(() => {
    mockSql.mockReset();
  });

  it("inserts via INSERT ... RETURNING * and maps the returned row", async () => {
    mockSql.mockResolvedValueOnce([row({ title: "Nueva Card", stage: "interesado" })]);

    const card = await pipelineRepo.create(BUSINESS_ID, { title: "Nueva Card", stage: "interesado" });

    expect(card.title).toBe("Nueva Card");
    expect(card.stage).toBe("interesado");

    const [strings] = mockSql.mock.calls[0]!;
    const queryText = Array.from(strings as unknown as string[]).join("");
    expect(queryText).toContain("INSERT INTO pipeline_cards");
    expect(queryText).toContain("RETURNING");
  });
});

describe("db pipelineRepo.update", () => {
  beforeEach(() => {
    mockSql.mockReset();
  });

  it("applies title/stage/amount/notes/position updates", async () => {
    mockSql
      .mockResolvedValueOnce([row()]) // SELECT existing
      .mockResolvedValueOnce([row({ title: "Actualizada", stage: "ganado", amount: 900000 })]); // UPDATE ... RETURNING

    const updated = await pipelineRepo.update(BUSINESS_ID, "70000000-0000-4000-8000-000000000001", {
      title: "Actualizada",
      stage: "ganado",
      amount: 900000,
    });

    expect(updated).not.toBeNull();
    expect(updated!.title).toBe("Actualizada");
    expect(updated!.stage).toBe("ganado");
    expect(updated!.amount).toBe(900000);
  });

  it("returns null for a cross-business update attempt without issuing an UPDATE", async () => {
    mockSql.mockResolvedValueOnce([row({ business_id: OTHER_BUSINESS_ID })]);

    const result = await pipelineRepo.update(BUSINESS_ID, "70000000-0000-4000-8000-000000000001", {
      title: "Hijacked",
    });

    expect(result).toBeNull();
    expect(mockSql).toHaveBeenCalledTimes(1); // only the SELECT, no UPDATE issued
  });
});

describe("db pipelineRepo.delete", () => {
  beforeEach(() => {
    mockSql.mockReset();
  });

  it("deletes and returns true when the row belongs to the requesting business", async () => {
    mockSql.mockResolvedValueOnce([row()]).mockResolvedValueOnce([]);

    const result = await pipelineRepo.delete(BUSINESS_ID, "70000000-0000-4000-8000-000000000001");

    expect(result).toBe(true);
    expect(mockSql).toHaveBeenCalledTimes(2);
    const [strings] = mockSql.mock.calls[1]!;
    const queryText = Array.from(strings as unknown as string[]).join("");
    expect(queryText).toContain("DELETE FROM pipeline_cards");
  });

  it("returns false (no DELETE issued) for a cross-business id", async () => {
    mockSql.mockResolvedValueOnce([row({ business_id: OTHER_BUSINESS_ID })]);

    const result = await pipelineRepo.delete(BUSINESS_ID, "70000000-0000-4000-8000-000000000001");

    expect(result).toBe(false);
    expect(mockSql).toHaveBeenCalledTimes(1);
  });

  it("returns false for a missing id", async () => {
    mockSql.mockResolvedValueOnce([]);

    const result = await pipelineRepo.delete(BUSINESS_ID, "00000000-0000-4000-8000-000000000000");

    expect(result).toBe(false);
  });
});

describe("db pipelineRepo.list", () => {
  beforeEach(() => {
    mockSql.mockReset();
  });

  it("filters by stage when provided", async () => {
    mockSql.mockResolvedValueOnce([
      row({ id: "a", stage: "nuevo" }),
      row({ id: "b", stage: "ganado" }),
    ]);

    const cards = await pipelineRepo.list(BUSINESS_ID, { stage: "ganado" });

    expect(cards.map((c) => c.id)).toEqual(["b"]);
  });

  it("sorts by stage order, then position, then createdAt", async () => {
    mockSql.mockResolvedValueOnce([
      row({ id: "ganado-1", stage: "ganado", position: 0, created_at: "2026-07-01T00:00:00.000Z" }),
      row({ id: "nuevo-pos1", stage: "nuevo", position: 1, created_at: "2026-07-01T00:00:00.000Z" }),
      row({ id: "nuevo-pos0-later", stage: "nuevo", position: 0, created_at: "2026-07-02T00:00:00.000Z" }),
      row({ id: "nuevo-pos0-earlier", stage: "nuevo", position: 0, created_at: "2026-07-01T00:00:00.000Z" }),
    ]);

    const cards = await pipelineRepo.list(BUSINESS_ID);

    expect(cards.map((c) => c.id)).toEqual([
      "nuevo-pos0-earlier",
      "nuevo-pos0-later",
      "nuevo-pos1",
      "ganado-1",
    ]);
  });
});
