import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Mirrors `lib/db/employee-repo.test.ts`'s mocking pattern: `sql` is a
 * postgres.js tagged-template function, mocked as `vi.fn()` with controlled
 * resolved values — no real Postgres connection is made. PLUS (mirroring
 * `lib/db/invoice-repo.test.ts`'s shape) a mocked `runTransaction`/`tx`, used
 * ONLY by `reorder` (Fix 1) — its default implementation just invokes the
 * callback with `mockTx`.
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

  it("inserts via INSERT ... RETURNING * and maps the returned row when an explicit position is given", async () => {
    mockSql.mockResolvedValueOnce([row({ title: "Nueva Card", stage: "interesado", position: 3 })]);

    const card = await pipelineRepo.create(BUSINESS_ID, { title: "Nueva Card", stage: "interesado", position: 3 });

    expect(card.title).toBe("Nueva Card");
    expect(card.stage).toBe("interesado");
    // Explicit position given -> no MAX-position lookup, exactly one query.
    expect(mockSql).toHaveBeenCalledTimes(1);
    const [strings] = mockSql.mock.calls[0]!;
    const queryText = Array.from(strings as unknown as string[]).join("");
    expect(queryText).toContain("INSERT INTO pipeline_cards");
    expect(queryText).toContain("RETURNING");
  });

  it("Fix 3 — appends (position = count, NOT a hardcoded 0) into a NON-empty stage when position is omitted", async () => {
    // Statement 1: MAX-position lookup -> 2 existing cards (positions 0,1) -> next is 2.
    mockSql.mockResolvedValueOnce([{ next_position: 2 }]);
    // Statement 2: the INSERT ... RETURNING.
    mockSql.mockResolvedValueOnce([row({ title: "Nueva Card", stage: "nuevo", position: 2 })]);

    const card = await pipelineRepo.create(BUSINESS_ID, { title: "Nueva Card", stage: "nuevo" });

    expect(card.position).toBe(2);
    expect(mockSql).toHaveBeenCalledTimes(2);
    const [maxStrings] = mockSql.mock.calls[0]!;
    expect(Array.from(maxStrings as unknown as string[]).join("")).toContain("COALESCE(MAX(position)");
    const insertCall = mockSql.mock.calls[1]!;
    expect(Array.from(insertCall[0] as unknown as string[]).join("")).toContain("INSERT INTO pipeline_cards");
    // Interpolated values in order: businessId, customerId, title, stage, amount, notes, position (index 7).
    expect(insertCall[7]).toBe(2);
  });

  it("appends at position 0 for an EMPTY stage when position is omitted", async () => {
    mockSql.mockResolvedValueOnce([{ next_position: 0 }]);
    mockSql.mockResolvedValueOnce([row({ title: "Primera", stage: "ganado", position: 0 })]);

    const card = await pipelineRepo.create(BUSINESS_ID, { title: "Primera", stage: "ganado" });

    expect(card.position).toBe(0);
  });
});

describe("db pipelineRepo.update", () => {
  beforeEach(() => {
    mockSql.mockReset();
  });

  it("applies title/amount/notes/position updates (explicit position given, so no MAX-position lookup)", async () => {
    mockSql
      .mockResolvedValueOnce([row()]) // SELECT existing
      .mockResolvedValueOnce([row({ title: "Actualizada", stage: "ganado", amount: 900000, position: 5 })]); // UPDATE ... RETURNING

    const updated = await pipelineRepo.update(BUSINESS_ID, "70000000-0000-4000-8000-000000000001", {
      title: "Actualizada",
      stage: "ganado",
      amount: 900000,
      position: 5,
    });

    expect(updated).not.toBeNull();
    expect(updated!.title).toBe("Actualizada");
    expect(updated!.stage).toBe("ganado");
    expect(updated!.amount).toBe(900000);
    // An explicit position is given, so the drag's own /reorder-style caller
    // is trusted as-is -> exactly 2 queries (SELECT existing + UPDATE).
    expect(mockSql).toHaveBeenCalledTimes(2);
  });

  it("Fix 4 — appends to the destination stage (does NOT keep the old position) when stage changes without an explicit position", async () => {
    mockSql
      .mockResolvedValueOnce([row({ stage: "nuevo", position: 0 })]) // SELECT existing
      .mockResolvedValueOnce([{ next_position: 3 }]) // MAX-position lookup in the NEW stage
      .mockResolvedValueOnce([row({ stage: "ganado", position: 3 })]); // UPDATE ... RETURNING

    const updated = await pipelineRepo.update(BUSINESS_ID, "70000000-0000-4000-8000-000000000001", {
      stage: "ganado",
    });

    expect(updated).not.toBeNull();
    expect(updated!.stage).toBe("ganado");
    expect(updated!.position).toBe(3);
    expect(mockSql).toHaveBeenCalledTimes(3);
    const [maxStrings] = mockSql.mock.calls[1]!;
    expect(Array.from(maxStrings as unknown as string[]).join("")).toContain("COALESCE(MAX(position)");
  });

  it("does NOT look up a MAX position when stage is unchanged, even without an explicit position", async () => {
    mockSql
      .mockResolvedValueOnce([row({ stage: "nuevo", position: 0 })]) // SELECT existing
      .mockResolvedValueOnce([row({ stage: "nuevo", title: "Solo titulo", position: 0 })]); // UPDATE ... RETURNING

    const updated = await pipelineRepo.update(BUSINESS_ID, "70000000-0000-4000-8000-000000000001", {
      title: "Solo titulo",
    });

    expect(updated!.position).toBe(0);
    expect(mockSql).toHaveBeenCalledTimes(2); // no MAX-position lookup issued
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

describe("db pipelineRepo.reorder", () => {
  beforeEach(() => {
    mockSql.mockReset();
    mockTx.mockReset();
    mockRunTransaction.mockReset();
    mockRunTransaction.mockImplementation((fn: (tx: typeof mockTx) => Promise<unknown>) => fn(mockTx));
  });

  it("runs ONE guarded UPDATE per item, sequentially, inside a SINGLE runTransaction callback", async () => {
    mockTx.mockResolvedValue([]);

    await pipelineRepo.reorder(BUSINESS_ID, [
      { id: "a", stage: "nuevo", position: 0 },
      { id: "b", stage: "nuevo", position: 1 },
      { id: "c", stage: "ganado", position: 0 },
    ]);

    expect(mockRunTransaction).toHaveBeenCalledTimes(1);
    expect(mockTx).toHaveBeenCalledTimes(3);

    for (const [index, expected] of [
      { id: "a", stage: "nuevo", position: 0 },
      { id: "b", stage: "nuevo", position: 1 },
      { id: "c", stage: "ganado", position: 0 },
    ].entries()) {
      const call = mockTx.mock.calls[index]!;
      const queryText = Array.from(call[0] as unknown as string[]).join("");
      expect(queryText).toContain("UPDATE pipeline_cards");
      expect(queryText).toContain("business_id");
      // Interpolated values in order: stage, position, id, businessId.
      expect(call[1]).toBe(expected.stage);
      expect(call[2]).toBe(expected.position);
      expect(call[3]).toBe(expected.id);
      expect(call[4]).toBe(BUSINESS_ID);
    }
  });

  it("is business-scoped: an UPDATE is still issued (but 0-row, no-op) for a foreign id — never a cross-business write", async () => {
    mockTx.mockResolvedValue([]);

    await pipelineRepo.reorder(BUSINESS_ID, [{ id: "foreign-card", stage: "nuevo", position: 0 }]);

    expect(mockTx).toHaveBeenCalledTimes(1);
    const call = mockTx.mock.calls[0]!;
    // The businessId guard is embedded in every statement's WHERE clause —
    // a foreign id's row simply doesn't match business_id, so 0 rows update.
    expect(call[4]).toBe(BUSINESS_ID);
  });
});
