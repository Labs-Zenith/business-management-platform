import { describe, expect, it } from "vitest";
import { ApiError } from "@/lib/server/api-error";
import { resetStore, store } from "@/lib/mock/store";
import type { Session } from "@/lib/services/ports";
import {
  createPipelineCard,
  deletePipelineCard,
  getPipelineCard,
  listPipelineCards,
  reorderPipelineCards,
  updatePipelineCard,
} from "./pipeline-service";

/**
 * Mirrors `employee-service.test.ts`'s technique: exercises the REAL mock
 * store (not a mocked repository) so business_id scoping is an observable
 * fact, not just an assertion about a thrown error. UNLIKE Employee, this
 * suite also proves `deletePipelineCard`.
 */

const BUSINESS_ID = "10000000-0000-4000-8000-000000000001";
const OTHER_BUSINESS_ID = "10000000-0000-4000-8000-000000000099";

const SESSION: Session = {
  userId: "20000000-0000-4000-8000-000000000001",
  businessId: BUSINESS_ID,
  email: "demo@negociodemo.test",
  role: "admin",
};

describe("createPipelineCard (pipeline-service)", () => {
  it("ALWAYS derives businessId from the session", async () => {
    resetStore();

    const card = await createPipelineCard(SESSION, { title: "Venta de prueba", stage: "nuevo" });

    expect(card.businessId).toBe(BUSINESS_ID);
    expect(store.pipelineCards.get(card.id)).toBeDefined();
  });
});

describe("getPipelineCard (pipeline-service)", () => {
  it("returns the card when it belongs to the session's business", async () => {
    resetStore();
    const created = await createPipelineCard(SESSION, { title: "Consultable", stage: "nuevo" });

    const found = await getPipelineCard(SESSION, created.id);

    expect(found.id).toBe(created.id);
  });

  it("throws NOT_FOUND for a cross-business card id, never leaking the record", async () => {
    resetStore();
    const created = await createPipelineCard(SESSION, { title: "De otro negocio", stage: "nuevo" });
    const otherSession: Session = { ...SESSION, businessId: OTHER_BUSINESS_ID };

    await expect(getPipelineCard(otherSession, created.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("throws NOT_FOUND for a missing card id", async () => {
    resetStore();

    await expect(getPipelineCard(SESSION, "00000000-0000-4000-8000-000000000000")).rejects.toBeInstanceOf(ApiError);
  });
});

describe("listPipelineCards (pipeline-service)", () => {
  it("lists only the session business's cards", async () => {
    resetStore();
    await createPipelineCard(SESSION, { title: "Propia", stage: "nuevo" });
    const otherSession: Session = { ...SESSION, businessId: OTHER_BUSINESS_ID };
    await createPipelineCard(otherSession, { title: "Ajena", stage: "nuevo" });

    const cards = await listPipelineCards(SESSION);

    expect(cards.every((c) => c.businessId === BUSINESS_ID)).toBe(true);
    expect(cards.some((c) => c.title === "Ajena")).toBe(false);
  });

  it("filters by stage when a query is provided", async () => {
    resetStore();
    await createPipelineCard(SESSION, { title: "Nueva", stage: "nuevo" });
    await createPipelineCard(SESSION, { title: "Ganada", stage: "ganado" });

    const cards = await listPipelineCards(SESSION, { stage: "ganado" });

    expect(cards.map((c) => c.title)).toEqual(["Ganada"]);
  });
});

describe("updatePipelineCard (pipeline-service)", () => {
  it("forwards only title/stage/customerId/amount/notes/position to the repository, ignoring forged fields", async () => {
    resetStore();
    const created = await createPipelineCard(SESSION, { title: "Original", stage: "nuevo" });
    const forgedData = {
      title: "Actualizada",
      businessId: OTHER_BUSINESS_ID,
    } as unknown as Parameters<typeof updatePipelineCard>[2];

    const updated = await updatePipelineCard(SESSION, created.id, forgedData);

    expect(updated.title).toBe("Actualizada");
    expect(updated.businessId).toBe(BUSINESS_ID);
  });

  it("throws NOT_FOUND for a cross-business update attempt", async () => {
    resetStore();
    const created = await createPipelineCard(SESSION, { title: "Original", stage: "nuevo" });
    const otherSession: Session = { ...SESSION, businessId: OTHER_BUSINESS_ID };

    await expect(updatePipelineCard(otherSession, created.id, { title: "Hijacked" })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("moves a card between stages without touching other fields", async () => {
    resetStore();
    const created = await createPipelineCard(SESSION, { title: "Original", stage: "nuevo", amount: 500000 });

    const updated = await updatePipelineCard(SESSION, created.id, { stage: "ganado", position: 1 });

    expect(updated.stage).toBe("ganado");
    expect(updated.position).toBe(1);
    expect(updated.title).toBe("Original");
    expect(updated.amount).toBe(500000);
  });
});

describe("reorderPipelineCards (pipeline-service)", () => {
  it("ALWAYS derives businessId from the session, ignoring a foreign id in the payload", async () => {
    resetStore();
    const own = await createPipelineCard(SESSION, { title: "Propia", stage: "nuevo" });
    const otherSession: Session = { ...SESSION, businessId: OTHER_BUSINESS_ID };
    const foreign = await createPipelineCard(otherSession, { title: "Ajena", stage: "nuevo" });

    await reorderPipelineCards(SESSION, [
      { id: own.id, stage: "ganado", position: 0 },
      { id: foreign.id, stage: "ganado", position: 1 },
    ]);

    expect(store.pipelineCards.get(own.id)!.stage).toBe("ganado");
    // Foreign card, scoped to a different business, is untouched.
    expect(store.pipelineCards.get(foreign.id)!.stage).toBe("nuevo");
  });
});

describe("deletePipelineCard (pipeline-service)", () => {
  it("deletes a card belonging to the session's business", async () => {
    resetStore();
    const created = await createPipelineCard(SESSION, { title: "A borrar", stage: "nuevo" });

    await deletePipelineCard(SESSION, created.id);

    expect(store.pipelineCards.has(created.id)).toBe(false);
  });

  it("throws NOT_FOUND for a cross-business delete attempt, leaving the record intact", async () => {
    resetStore();
    const created = await createPipelineCard(SESSION, { title: "Protegida", stage: "nuevo" });
    const otherSession: Session = { ...SESSION, businessId: OTHER_BUSINESS_ID };

    await expect(deletePipelineCard(otherSession, created.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(store.pipelineCards.has(created.id)).toBe(true);
  });

  it("throws NOT_FOUND for a missing card id", async () => {
    resetStore();

    await expect(deletePipelineCard(SESSION, "00000000-0000-4000-8000-000000000000")).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });
});
