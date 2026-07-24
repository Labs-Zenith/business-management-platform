import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetStore, store } from "@/lib/mock/store";
import { repositories } from "@/lib/services/repositories";
import type { PipelineCard } from "@/lib/services/ports";

/**
 * Same in-memory cookie jar strategy as `app/api/products/products-routes.test.ts`:
 * `next/headers`'s `cookies()` only works inside a real Next.js request
 * context, so this mocks the primitive with a stateful jar shared across a
 * single test — exercises the REAL `authAdapter` -> `session.ts` -> route
 * handler -> `pipeline-service.ts` -> `pipeline-repo.ts` code path.
 *
 * Ventas has NO role gating (any authenticated member may use the board), but
 * DOES have a per-BUSINESS feature gate (`isPipelineEnabled`) — every group
 * below proves BOTH the 403-when-disabled path AND the enabled/happy path, in
 * addition to the shared 401/cross-business/origin concerns.
 */
const { mockCookieJar } = vi.hoisted(() => {
  const jarStore = new Map<string, string>();
  return {
    mockCookieJar: {
      get(name: string) {
        return jarStore.has(name) ? { name, value: jarStore.get(name)! } : undefined;
      },
      set(name: string, value: string) {
        jarStore.set(name, value);
      },
      delete(name: string) {
        jarStore.delete(name);
      },
      clear() {
        jarStore.clear();
      },
    },
  };
});

vi.mock("next/headers", () => ({
  cookies: async () => mockCookieJar,
}));

const { GET: listGet, POST: listPost } = await import("./route");
const { PATCH: detailPatch, DELETE: detailDelete } = await import("./[id]/route");
const { POST: reorderPost } = await import("./reorder/route");

const BUSINESS_ID = "10000000-0000-4000-8000-000000000001";
const OTHER_BUSINESS_ID = "10000000-0000-4000-8000-000000000099";
const DEMO_EMAIL = "demo@negociodemo.test";
const DEMO_PASSWORD = "demo1234";

function buildContext(id: string) {
  return { params: Promise.resolve({ id }) };
}

async function signIn(): Promise<void> {
  const session = await repositories.auth.signIn(DEMO_EMAIL, DEMO_PASSWORD);
  if (!session) {
    throw new Error("Test setup failed: demo sign-in did not succeed.");
  }
}

/** Seeds a pipeline card directly under the session's business, straight into the mock store. */
function seedCard(overrides: Partial<PipelineCard> = {}): PipelineCard {
  const card: PipelineCard = {
    id: "80000000-0000-4000-8000-000000000001",
    businessId: BUSINESS_ID,
    customerId: null,
    title: "Card sembrada",
    stage: "nuevo",
    amount: 500000,
    notes: null,
    position: 0,
    createdAt: "2024-01-01T00:00:00.000Z",
    updatedAt: "2024-01-01T00:00:00.000Z",
    ...overrides,
  };
  store.pipelineCards.set(card.id, card);
  return card;
}

const ORIGINAL_APP_ORIGIN = process.env.APP_ORIGIN;
const ORIGINAL_PIPELINE_ENABLED = process.env.PIPELINE_ENABLED_BUSINESS_IDS;

function enablePipelineForSessionBusiness(): void {
  process.env.PIPELINE_ENABLED_BUSINESS_IDS = BUSINESS_ID;
}

function disablePipeline(): void {
  delete process.env.PIPELINE_ENABLED_BUSINESS_IDS;
}

describe("GET /api/ventas", () => {
  beforeEach(() => {
    resetStore();
    mockCookieJar.clear();
  });

  afterEach(() => {
    if (ORIGINAL_PIPELINE_ENABLED === undefined) {
      delete process.env.PIPELINE_ENABLED_BUSINESS_IDS;
    } else {
      process.env.PIPELINE_ENABLED_BUSINESS_IDS = ORIGINAL_PIPELINE_ENABLED;
    }
  });

  it("rejects unauthenticated requests with 401 UNAUTHENTICATED", async () => {
    enablePipelineForSessionBusiness();

    const response = await listGet(new Request("http://localhost:3000/api/ventas"));

    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.error.code).toBe("UNAUTHENTICATED");
  });

  it("rejects an authenticated session with 403 FORBIDDEN when the feature is disabled for the business", async () => {
    disablePipeline();
    await signIn();

    const response = await listGet(new Request("http://localhost:3000/api/ventas"));

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error.code).toBe("FORBIDDEN");
  });

  it("returns only the session business's cards, with Cache-Control: no-store, and no pagination envelope", async () => {
    enablePipelineForSessionBusiness();
    await signIn();
    const own = seedCard();
    seedCard({ id: "80000000-0000-4000-8000-000000000099", businessId: OTHER_BUSINESS_ID, title: "Ajena" });

    const response = await listGet(new Request("http://localhost:3000/api/ventas"));

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const body = await response.json();
    expect(body.data.some((c: PipelineCard) => c.id === own.id)).toBe(true);
    expect(body.data.every((c: PipelineCard) => c.businessId === BUSINESS_ID)).toBe(true);
    expect(body.page).toBeUndefined();
  });
});

describe("POST /api/ventas", () => {
  beforeEach(() => {
    resetStore();
    mockCookieJar.clear();
    process.env.APP_ORIGIN = "http://localhost:3000";
  });

  afterEach(() => {
    if (ORIGINAL_APP_ORIGIN === undefined) {
      delete process.env.APP_ORIGIN;
    } else {
      process.env.APP_ORIGIN = ORIGINAL_APP_ORIGIN;
    }
    if (ORIGINAL_PIPELINE_ENABLED === undefined) {
      delete process.env.PIPELINE_ENABLED_BUSINESS_IDS;
    } else {
      process.env.PIPELINE_ENABLED_BUSINESS_IDS = ORIGINAL_PIPELINE_ENABLED;
    }
  });

  function postRequest(body: unknown, headers: Record<string, string> = {}) {
    return new Request("http://localhost:3000/api/ventas", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "http://localhost:3000", ...headers },
      body: JSON.stringify(body),
    });
  }

  it("rejects unauthenticated requests with 401 UNAUTHENTICATED", async () => {
    enablePipelineForSessionBusiness();

    const response = await listPost(postRequest({ title: "Nueva Card", stage: "nuevo" }));

    expect(response.status).toBe(401);
  });

  it("rejects with 403 FORBIDDEN when the feature is disabled, creating nothing", async () => {
    disablePipeline();
    await signIn();
    const countBefore = store.pipelineCards.size;

    const response = await listPost(postRequest({ title: "Nueva Card", stage: "nuevo" }));

    expect(response.status).toBe(403);
    expect(store.pipelineCards.size).toBe(countBefore);
  });

  it("creates a card under the session's business", async () => {
    enablePipelineForSessionBusiness();
    await signIn();

    const response = await listPost(postRequest({ title: "Nueva Card", stage: "interesado", amount: 300000 }));

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.data.title).toBe("Nueva Card");
    expect(body.data.stage).toBe("interesado");
    expect(body.data.amount).toBe(300000);
    expect(body.data.businessId).toBe(BUSINESS_ID);
  });

  it("rejects (via strict schema) a forged business_id field with 400 VALIDATION_ERROR, creating nothing", async () => {
    enablePipelineForSessionBusiness();
    await signIn();
    const countBefore = store.pipelineCards.size;

    const response = await listPost(
      postRequest({ title: "Forjada", stage: "nuevo", business_id: "hacked" }),
    );

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(store.pipelineCards.size).toBe(countBefore);
  });

  it("rejects an invalid stage with 400 VALIDATION_ERROR", async () => {
    enablePipelineForSessionBusiness();
    await signIn();

    const response = await listPost(postRequest({ title: "Invalida", stage: "no-existe" }));

    expect(response.status).toBe(400);
  });

  it("rejects a mismatched Origin header with 403 FORBIDDEN before touching the store", async () => {
    enablePipelineForSessionBusiness();
    await signIn();

    const response = await listPost(
      postRequest({ title: "Maliciosa", stage: "nuevo" }, { origin: "http://evil.test" }),
    );

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error.code).toBe("FORBIDDEN");
  });
});

describe("PATCH /api/ventas/{id}", () => {
  beforeEach(() => {
    resetStore();
    mockCookieJar.clear();
    process.env.APP_ORIGIN = "http://localhost:3000";
  });

  afterEach(() => {
    if (ORIGINAL_APP_ORIGIN === undefined) {
      delete process.env.APP_ORIGIN;
    } else {
      process.env.APP_ORIGIN = ORIGINAL_APP_ORIGIN;
    }
    if (ORIGINAL_PIPELINE_ENABLED === undefined) {
      delete process.env.PIPELINE_ENABLED_BUSINESS_IDS;
    } else {
      process.env.PIPELINE_ENABLED_BUSINESS_IDS = ORIGINAL_PIPELINE_ENABLED;
    }
  });

  function patchRequest(id: string, body: unknown) {
    return new Request(`http://localhost:3000/api/ventas/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json", origin: "http://localhost:3000" },
      body: JSON.stringify(body),
    });
  }

  it("rejects unauthenticated requests with 401 UNAUTHENTICATED", async () => {
    enablePipelineForSessionBusiness();
    const card = seedCard();

    const response = await detailPatch(patchRequest(card.id, { stage: "ganado" }), buildContext(card.id));

    expect(response.status).toBe(401);
  });

  it("rejects with 403 FORBIDDEN when the feature is disabled, applying no change", async () => {
    disablePipeline();
    await signIn();
    const card = seedCard();

    const response = await detailPatch(patchRequest(card.id, { stage: "ganado" }), buildContext(card.id));

    expect(response.status).toBe(403);
    expect(store.pipelineCards.get(card.id)?.stage).toBe("nuevo");
  });

  it("applies a valid update (stage, position) for an authenticated session", async () => {
    enablePipelineForSessionBusiness();
    await signIn();
    const card = seedCard();

    const response = await detailPatch(patchRequest(card.id, { stage: "ganado", position: 2 }), buildContext(card.id));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.stage).toBe("ganado");
    expect(body.data.position).toBe(2);
  });

  it("rejects (via strict schema) an unknown field with 400 VALIDATION_ERROR", async () => {
    enablePipelineForSessionBusiness();
    await signIn();
    const card = seedCard();

    const response = await detailPatch(patchRequest(card.id, { businessId: OTHER_BUSINESS_ID }), buildContext(card.id));

    expect(response.status).toBe(400);
  });

  it("returns 404 NOT_FOUND for an unknown card id", async () => {
    enablePipelineForSessionBusiness();
    await signIn();

    const response = await detailPatch(
      patchRequest("90000000-0000-4000-8000-999999999999", { stage: "ganado" }),
      buildContext("90000000-0000-4000-8000-999999999999"),
    );

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error.code).toBe("NOT_FOUND");
  });

  it("returns 404 NOT_FOUND for a card belonging to a different business, applying no change", async () => {
    enablePipelineForSessionBusiness();
    await signIn();
    const otherCard = seedCard({ id: "80000000-0000-4000-8000-000000000098", businessId: OTHER_BUSINESS_ID });

    const response = await detailPatch(patchRequest(otherCard.id, { stage: "ganado" }), buildContext(otherCard.id));

    expect(response.status).toBe(404);
    expect(store.pipelineCards.get(otherCard.id)?.stage).toBe("nuevo");
  });

  it("rejects a mismatched Origin header with 403 FORBIDDEN", async () => {
    enablePipelineForSessionBusiness();
    await signIn();
    const card = seedCard();

    const response = await detailPatch(
      new Request(`http://localhost:3000/api/ventas/${card.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json", origin: "http://evil.test" },
        body: JSON.stringify({ stage: "ganado" }),
      }),
      buildContext(card.id),
    );

    expect(response.status).toBe(403);
  });
});

describe("DELETE /api/ventas/{id}", () => {
  beforeEach(() => {
    resetStore();
    mockCookieJar.clear();
    process.env.APP_ORIGIN = "http://localhost:3000";
  });

  afterEach(() => {
    if (ORIGINAL_APP_ORIGIN === undefined) {
      delete process.env.APP_ORIGIN;
    } else {
      process.env.APP_ORIGIN = ORIGINAL_APP_ORIGIN;
    }
    if (ORIGINAL_PIPELINE_ENABLED === undefined) {
      delete process.env.PIPELINE_ENABLED_BUSINESS_IDS;
    } else {
      process.env.PIPELINE_ENABLED_BUSINESS_IDS = ORIGINAL_PIPELINE_ENABLED;
    }
  });

  function deleteRequest(id: string) {
    return new Request(`http://localhost:3000/api/ventas/${id}`, {
      method: "DELETE",
      headers: { "content-type": "application/json", origin: "http://localhost:3000" },
    });
  }

  it("rejects unauthenticated requests with 401 UNAUTHENTICATED", async () => {
    enablePipelineForSessionBusiness();
    const card = seedCard();

    const response = await detailDelete(deleteRequest(card.id), buildContext(card.id));

    expect(response.status).toBe(401);
  });

  it("rejects with 403 FORBIDDEN when the feature is disabled, deleting nothing", async () => {
    disablePipeline();
    await signIn();
    const card = seedCard();

    const response = await detailDelete(deleteRequest(card.id), buildContext(card.id));

    expect(response.status).toBe(403);
    expect(store.pipelineCards.has(card.id)).toBe(true);
  });

  it("deletes a card belonging to the session's business", async () => {
    enablePipelineForSessionBusiness();
    await signIn();
    const card = seedCard();

    const response = await detailDelete(deleteRequest(card.id), buildContext(card.id));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.ok).toBe(true);
    expect(store.pipelineCards.has(card.id)).toBe(false);
  });

  it("returns 404 NOT_FOUND for an unknown card id", async () => {
    enablePipelineForSessionBusiness();
    await signIn();

    const response = await detailDelete(
      deleteRequest("90000000-0000-4000-8000-999999999999"),
      buildContext("90000000-0000-4000-8000-999999999999"),
    );

    expect(response.status).toBe(404);
  });

  it("returns 404 NOT_FOUND for a card belonging to a different business, deleting nothing", async () => {
    enablePipelineForSessionBusiness();
    await signIn();
    const otherCard = seedCard({ id: "80000000-0000-4000-8000-000000000097", businessId: OTHER_BUSINESS_ID });

    const response = await detailDelete(deleteRequest(otherCard.id), buildContext(otherCard.id));

    expect(response.status).toBe(404);
    expect(store.pipelineCards.has(otherCard.id)).toBe(true);
  });

  it("rejects a mismatched Origin header with 403 FORBIDDEN", async () => {
    enablePipelineForSessionBusiness();
    await signIn();
    const card = seedCard();

    const response = await detailDelete(
      new Request(`http://localhost:3000/api/ventas/${card.id}`, {
        method: "DELETE",
        headers: { "content-type": "application/json", origin: "http://evil.test" },
      }),
      buildContext(card.id),
    );

    expect(response.status).toBe(403);
    expect(store.pipelineCards.has(card.id)).toBe(true);
  });
});

describe("POST /api/ventas/reorder", () => {
  beforeEach(() => {
    resetStore();
    mockCookieJar.clear();
    process.env.APP_ORIGIN = "http://localhost:3000";
  });

  afterEach(() => {
    if (ORIGINAL_APP_ORIGIN === undefined) {
      delete process.env.APP_ORIGIN;
    } else {
      process.env.APP_ORIGIN = ORIGINAL_APP_ORIGIN;
    }
    if (ORIGINAL_PIPELINE_ENABLED === undefined) {
      delete process.env.PIPELINE_ENABLED_BUSINESS_IDS;
    } else {
      process.env.PIPELINE_ENABLED_BUSINESS_IDS = ORIGINAL_PIPELINE_ENABLED;
    }
  });

  function reorderRequest(body: unknown, headers: Record<string, string> = {}) {
    return new Request("http://localhost:3000/api/ventas/reorder", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "http://localhost:3000", ...headers },
      body: JSON.stringify(body),
    });
  }

  it("rejects unauthenticated requests with 401 UNAUTHENTICATED", async () => {
    enablePipelineForSessionBusiness();

    const response = await reorderPost(
      reorderRequest({ items: [{ id: "80000000-0000-4000-8000-000000000001", stage: "ganado", position: 0 }] }),
    );

    expect(response.status).toBe(401);
  });

  it("rejects with 403 FORBIDDEN when the feature is disabled for the business, applying no change", async () => {
    disablePipeline();
    await signIn();
    const card = seedCard();

    const response = await reorderPost(
      reorderRequest({ items: [{ id: card.id, stage: "ganado", position: 0 }] }),
    );

    expect(response.status).toBe(403);
    expect(store.pipelineCards.get(card.id)?.stage).toBe("nuevo");
  });

  it("200 happy path — applies the FULL renumbered set for multiple cards atomically", async () => {
    enablePipelineForSessionBusiness();
    await signIn();
    const a = seedCard({ id: "80000000-0000-4000-8000-000000000001", title: "A", stage: "nuevo", position: 0 });
    const b = seedCard({ id: "80000000-0000-4000-8000-000000000002", title: "B", stage: "nuevo", position: 1 });

    const response = await reorderPost(
      reorderRequest({
        items: [
          { id: b.id, stage: "nuevo", position: 0 },
          { id: a.id, stage: "nuevo", position: 1 },
        ],
      }),
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.ok).toBe(true);
    expect(store.pipelineCards.get(b.id)?.position).toBe(0);
    expect(store.pipelineCards.get(a.id)?.position).toBe(1);
  });

  it("rejects (via strict schema) an empty items array with 400 VALIDATION_ERROR", async () => {
    enablePipelineForSessionBusiness();
    await signIn();

    const response = await reorderPost(reorderRequest({ items: [] }));

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  it("rejects (via strict schema) an unknown field on an item with 400 VALIDATION_ERROR, applying no change", async () => {
    enablePipelineForSessionBusiness();
    await signIn();
    const card = seedCard();

    const response = await reorderPost(
      reorderRequest({ items: [{ id: card.id, stage: "ganado", position: 0, businessId: OTHER_BUSINESS_ID }] }),
    );

    expect(response.status).toBe(400);
    expect(store.pipelineCards.get(card.id)?.stage).toBe("nuevo");
  });

  it("rejects an invalid stage with 400 VALIDATION_ERROR", async () => {
    enablePipelineForSessionBusiness();
    await signIn();
    const card = seedCard();

    const response = await reorderPost(
      reorderRequest({ items: [{ id: card.id, stage: "no-existe", position: 0 }] }),
    );

    expect(response.status).toBe(400);
  });

  it("rejects a mismatched Origin header with 403 FORBIDDEN", async () => {
    enablePipelineForSessionBusiness();
    await signIn();
    const card = seedCard();

    const response = await reorderPost(
      reorderRequest(
        { items: [{ id: card.id, stage: "ganado", position: 0 }] },
        { origin: "http://evil.test" },
      ),
    );

    expect(response.status).toBe(403);
    expect(store.pipelineCards.get(card.id)?.stage).toBe("nuevo");
  });

  it("is business-scoped: silently skips a foreign id, applying the rest of the batch", async () => {
    enablePipelineForSessionBusiness();
    await signIn();
    const own = seedCard({ id: "80000000-0000-4000-8000-000000000001", stage: "nuevo", position: 0 });
    const foreign = seedCard({
      id: "80000000-0000-4000-8000-000000000099",
      businessId: OTHER_BUSINESS_ID,
      stage: "nuevo",
      position: 0,
    });

    const response = await reorderPost(
      reorderRequest({
        items: [
          { id: own.id, stage: "ganado", position: 0 },
          { id: foreign.id, stage: "ganado", position: 1 },
        ],
      }),
    );

    expect(response.status).toBe(200);
    expect(store.pipelineCards.get(own.id)?.stage).toBe("ganado");
    expect(store.pipelineCards.get(foreign.id)?.stage).toBe("nuevo");
  });
});
