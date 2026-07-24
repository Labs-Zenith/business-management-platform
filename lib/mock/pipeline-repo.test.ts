import { beforeEach, describe, expect, it } from "vitest";
import type { PipelineCardCreate } from "@/lib/services/ports";
import { createPipelineRepository } from "./pipeline-repo";
import { createEmptyStore, type MockStore } from "./store";

/**
 * Mirrors `lib/mock/employee-repo.test.ts`'s scope (business_id scoping,
 * editable-CRUD), adapted for PipelineCard's shape. UNLIKE Employee, cards
 * ARE deletable — this suite proves `delete` in addition to
 * create/getById/update/list (with stage filter + stage/position/createdAt
 * ordering).
 */

const BUSINESS_ID = "10000000-0000-4000-8000-000000000001";
const OTHER_BUSINESS_ID = "10000000-0000-4000-8000-000000000099";

function buildInput(overrides: Partial<PipelineCardCreate> = {}): PipelineCardCreate {
  return {
    title: "Venta de prueba",
    stage: "nuevo",
    ...overrides,
  };
}

let store: MockStore;

beforeEach(() => {
  store = createEmptyStore();
});

describe("createPipelineRepository.create", () => {
  it("persists the card under businessId with the given fields, defaulting position to 0", async () => {
    const repo = createPipelineRepository(store);

    const card = await repo.create(BUSINESS_ID, buildInput());

    expect(card.businessId).toBe(BUSINESS_ID);
    expect(card.title).toBe("Venta de prueba");
    expect(card.stage).toBe("nuevo");
    expect(card.customerId).toBeNull();
    expect(card.amount).toBeNull();
    expect(card.notes).toBeNull();
    expect(card.position).toBe(0);
    expect(store.pipelineCards.get(card.id)).toEqual(card);
  });

  it("persists optional fields (customerId, amount, notes, position) when provided", async () => {
    const repo = createPipelineRepository(store);

    const card = await repo.create(
      BUSINESS_ID,
      buildInput({ customerId: "30000000-0000-4000-8000-000000000001", amount: 250000, notes: "Nota", position: 3 }),
    );

    expect(card.customerId).toBe("30000000-0000-4000-8000-000000000001");
    expect(card.amount).toBe(250000);
    expect(card.notes).toBe("Nota");
    expect(card.position).toBe(3);
  });
});

describe("createPipelineRepository.getById — business_id scoping", () => {
  it("returns the card when it belongs to the requesting business", async () => {
    const repo = createPipelineRepository(store);
    const created = await repo.create(BUSINESS_ID, buildInput());

    const found = await repo.getById(BUSINESS_ID, created.id);

    expect(found).not.toBeNull();
    expect(found!.id).toBe(created.id);
  });

  it("returns null (not a leaked record) for a card belonging to another business", async () => {
    const repo = createPipelineRepository(store);
    const created = await repo.create(BUSINESS_ID, buildInput());

    const found = await repo.getById(OTHER_BUSINESS_ID, created.id);

    expect(found).toBeNull();
  });

  it("returns null for a missing card id", async () => {
    const repo = createPipelineRepository(store);

    const found = await repo.getById(BUSINESS_ID, "00000000-0000-4000-8000-000000000000");

    expect(found).toBeNull();
  });
});

describe("createPipelineRepository.update", () => {
  it("applies title/stage/amount/notes/position updates", async () => {
    const repo = createPipelineRepository(store);
    const created = await repo.create(BUSINESS_ID, buildInput());

    const updated = await repo.update(BUSINESS_ID, created.id, {
      title: "Actualizada",
      stage: "ganado",
      amount: 900000,
      notes: "Cerrada",
      position: 2,
    });

    expect(updated).not.toBeNull();
    expect(updated!.title).toBe("Actualizada");
    expect(updated!.stage).toBe("ganado");
    expect(updated!.amount).toBe(900000);
    expect(updated!.notes).toBe("Cerrada");
    expect(updated!.position).toBe(2);
  });

  it("returns null for cross-business update attempts, leaving the record unchanged", async () => {
    const repo = createPipelineRepository(store);
    const created = await repo.create(BUSINESS_ID, buildInput());

    const result = await repo.update(OTHER_BUSINESS_ID, created.id, { title: "Hijacked" });

    expect(result).toBeNull();
    expect(store.pipelineCards.get(created.id)!.title).toBe("Venta de prueba");
  });
});

describe("createPipelineRepository.delete", () => {
  it("removes the card and returns true when it belongs to the requesting business", async () => {
    const repo = createPipelineRepository(store);
    const created = await repo.create(BUSINESS_ID, buildInput());

    const result = await repo.delete(BUSINESS_ID, created.id);

    expect(result).toBe(true);
    expect(store.pipelineCards.has(created.id)).toBe(false);
  });

  it("returns false and leaves the record intact for a cross-business delete attempt", async () => {
    const repo = createPipelineRepository(store);
    const created = await repo.create(BUSINESS_ID, buildInput());

    const result = await repo.delete(OTHER_BUSINESS_ID, created.id);

    expect(result).toBe(false);
    expect(store.pipelineCards.has(created.id)).toBe(true);
  });

  it("returns false for a missing card id", async () => {
    const repo = createPipelineRepository(store);

    const result = await repo.delete(BUSINESS_ID, "00000000-0000-4000-8000-000000000000");

    expect(result).toBe(false);
  });
});

describe("createPipelineRepository.list", () => {
  it("returns only cards scoped to businessId, with no pagination", async () => {
    const repo = createPipelineRepository(store);
    await repo.create(BUSINESS_ID, buildInput({ title: "Propia" }));
    await repo.create(OTHER_BUSINESS_ID, buildInput({ title: "Ajena" }));

    const cards = await repo.list(BUSINESS_ID);

    expect(cards.length).toBe(1);
    expect(cards[0]!.title).toBe("Propia");
  });

  it("filters by stage when provided", async () => {
    const repo = createPipelineRepository(store);
    await repo.create(BUSINESS_ID, buildInput({ title: "Nueva", stage: "nuevo" }));
    await repo.create(BUSINESS_ID, buildInput({ title: "Ganada", stage: "ganado" }));

    const cards = await repo.list(BUSINESS_ID, { stage: "ganado" });

    expect(cards.map((c) => c.title)).toEqual(["Ganada"]);
  });

  it("orders by stage order, then position, then createdAt", async () => {
    const repo = createPipelineRepository(store);
    await repo.create(BUSINESS_ID, buildInput({ title: "Ganada", stage: "ganado", position: 0 }));
    const nuevoPos1 = await repo.create(BUSINESS_ID, buildInput({ title: "Nuevo pos1", stage: "nuevo", position: 1 }));
    const nuevoPos0First = await repo.create(
      BUSINESS_ID,
      buildInput({ title: "Nuevo pos0 first", stage: "nuevo", position: 0 }),
    );
    const nuevoPos0Second = await repo.create(
      BUSINESS_ID,
      buildInput({ title: "Nuevo pos0 second", stage: "nuevo", position: 0 }),
    );

    const cards = await repo.list(BUSINESS_ID);

    expect(cards.map((c) => c.title)).toEqual(["Nuevo pos0 first", "Nuevo pos0 second", "Nuevo pos1", "Ganada"]);
    // sanity: confirms creation order is preserved for the position-0 tie via createdAt
    expect(nuevoPos0First.createdAt <= nuevoPos0Second.createdAt).toBe(true);
    expect(nuevoPos1.stage).toBe("nuevo");
  });
});
