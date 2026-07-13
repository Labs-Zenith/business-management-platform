import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetStore, store } from "@/lib/mock/store";
import { repositories } from "@/lib/services/repositories";
import { productFixtures } from "@/lib/mock/fixtures/data";
import type { Product } from "@/lib/services/ports";

/**
 * Same in-memory cookie jar strategy as `app/api/expenses/expenses-route.test.ts`:
 * `next/headers`'s `cookies()` only works inside a real Next.js request
 * context, so this mocks the primitive with a stateful jar shared across a
 * single test — exercises the REAL `authAdapter` -> `session.ts` -> route
 * handler -> `product-service.ts` -> `product-repo.ts` code path, only
 * faking the underlying cookie storage.
 *
 * Unlike Nomina's employee routes, Inventario has NO role gating (per
 * `openspec/changes/inventario/specs/inventory-tracking/spec.md`'s "No Role
 * Gating on Inventory" requirement), so there is no worker-403 path to test
 * here — every group below only proves the plain-session-authenticated path
 * plus the shared 401/cross-business/origin concerns.
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
const { PATCH: detailPatch } = await import("./[id]/route");

const BUSINESS_ID = "10000000-0000-4000-8000-000000000001";
const OTHER_BUSINESS_ID = "10000000-0000-4000-8000-000000000099";
const DEMO_EMAIL = "demo@negociodemo.test";
const DEMO_PASSWORD = "demo1234";
const EXISTING_PRODUCT_ID = productFixtures[0]!.id;
const INACTIVE_PRODUCT_ID = productFixtures.find((product) => !product.active)!.id;

function buildContext(id: string) {
  return { params: Promise.resolve({ id }) };
}

async function signIn(): Promise<void> {
  const session = await repositories.auth.signIn(DEMO_EMAIL, DEMO_PASSWORD);
  if (!session) {
    throw new Error("Test setup failed: demo sign-in did not succeed.");
  }
}

/** Seeds a product directly under a DIFFERENT business, straight into the mock store. */
function seedOtherBusinessProduct(): Product {
  const product: Product = {
    id: "90000000-0000-4000-8000-000000000998",
    businessId: OTHER_BUSINESS_ID,
    name: "Producto de otro negocio",
    sku: null,
    unitCost: 10000,
    minStockThreshold: 0,
    active: true,
    createdAt: "2024-01-01T00:00:00.000Z",
    updatedAt: "2024-01-01T00:00:00.000Z",
  };
  store.products.set(product.id, product);
  return product;
}

const ORIGINAL_APP_ORIGIN = process.env.APP_ORIGIN;

describe("GET /api/products", () => {
  beforeEach(() => {
    resetStore();
    mockCookieJar.clear();
  });

  it("rejects unauthenticated requests with 401 UNAUTHENTICATED", async () => {
    const response = await listGet(new Request("http://localhost:3000/api/products"));

    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.error.code).toBe("UNAUTHENTICATED");
  });

  it("returns only the session business's products, paginated, with Cache-Control: no-store, and computed stock", async () => {
    await signIn();
    const otherProduct = seedOtherBusinessProduct();

    const response = await listGet(new Request("http://localhost:3000/api/products?page=1&pageSize=50"));

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const body = await response.json();
    expect(body.data.length).toBe(productFixtures.length);
    expect(body.data.every((product: { id: string }) => product.id !== otherProduct.id)).toBe(true);
    expect(body.data.every((product: { currentQuantity: number }) => typeof product.currentQuantity === "number")).toBe(
      true,
    );
  });

  it("filters by status=active, excluding the seeded inactive product", async () => {
    await signIn();

    const response = await listGet(new Request("http://localhost:3000/api/products?status=active"));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.every((p: { active: boolean }) => p.active)).toBe(true);
    expect(body.data.some((p: { id: string }) => p.id === INACTIVE_PRODUCT_ID)).toBe(false);
  });

  it("rejects an invalid status query parameter with 400 VALIDATION_ERROR", async () => {
    await signIn();

    const response = await listGet(new Request("http://localhost:3000/api/products?status=whatever"));

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });
});

describe("POST /api/products", () => {
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
  });

  function postRequest(body: unknown, headers: Record<string, string> = {}) {
    return new Request("http://localhost:3000/api/products", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "http://localhost:3000", ...headers },
      body: JSON.stringify(body),
    });
  }

  it("rejects unauthenticated requests with 401 UNAUTHENTICATED", async () => {
    const response = await listPost(postRequest({ name: "Crema Facial", unitCost: 30000 }));

    expect(response.status).toBe(401);
  });

  it("creates a product under the session's business, active by default", async () => {
    await signIn();

    const response = await listPost(
      postRequest({ name: "Crema Facial", sku: "CRE-005", unitCost: 30000, minStockThreshold: 5 }),
    );

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.data.name).toBe("Crema Facial");
    expect(body.data.sku).toBe("CRE-005");
    expect(body.data.unitCost).toBe(30000);
    expect(body.data.minStockThreshold).toBe(5);
    expect(body.data.active).toBe(true);
    expect(body.data.businessId).toBe(BUSINESS_ID);
  });

  it("creates a product without sku, stored as null", async () => {
    await signIn();

    const response = await listPost(postRequest({ name: "Producto sin SKU", unitCost: 10000 }));

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.data.sku).toBeNull();
  });

  it("rejects (via strict schema) a forged business_id/active field with 400 VALIDATION_ERROR, creating nothing", async () => {
    await signIn();
    const countBefore = store.products.size;

    const response = await listPost(
      postRequest({ name: "Producto Forjado", unitCost: 10000, business_id: "hacked", active: false }),
    );

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(store.products.size).toBe(countBefore);
  });

  it("rejects a zero/negative/non-integer unitCost with 400 VALIDATION_ERROR", async () => {
    await signIn();

    const zero = await listPost(postRequest({ name: "Invalido", unitCost: 0 }));
    expect(zero.status).toBe(400);

    const fractional = await listPost(postRequest({ name: "Invalido", unitCost: 100.5 }));
    expect(fractional.status).toBe(400);
  });

  it("rejects a mismatched Origin header with 403 FORBIDDEN before touching the store", async () => {
    await signIn();

    const response = await listPost(
      postRequest({ name: "Producto Malicioso", unitCost: 10000 }, { origin: "http://evil.test" }),
    );

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error.code).toBe("FORBIDDEN");
  });
});

describe("PATCH /api/products/{id}", () => {
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
  });

  function patchRequest(body: unknown) {
    return new Request(`http://localhost:3000/api/products/${EXISTING_PRODUCT_ID}`, {
      method: "PATCH",
      headers: { "content-type": "application/json", origin: "http://localhost:3000" },
      body: JSON.stringify(body),
    });
  }

  it("rejects unauthenticated requests with 401 UNAUTHENTICATED", async () => {
    const response = await detailPatch(patchRequest({ unitCost: 40000 }), buildContext(EXISTING_PRODUCT_ID));

    expect(response.status).toBe(401);
  });

  it("applies a valid update (unitCost, active) for an authenticated session", async () => {
    await signIn();

    const response = await detailPatch(
      patchRequest({ unitCost: 40000, active: false }),
      buildContext(EXISTING_PRODUCT_ID),
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.unitCost).toBe(40000);
    expect(body.data.active).toBe(false);
  });

  it("returns 404 NOT_FOUND for an unknown product id", async () => {
    await signIn();

    const response = await detailPatch(
      patchRequest({ unitCost: 40000 }),
      buildContext("90000000-0000-4000-8000-999999999999"),
    );

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error.code).toBe("NOT_FOUND");
  });

  it("returns 404 NOT_FOUND for a product belonging to a different business, applying no change", async () => {
    await signIn();
    const otherProduct = seedOtherBusinessProduct();

    const response = await detailPatch(
      new Request(`http://localhost:3000/api/products/${otherProduct.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json", origin: "http://localhost:3000" },
        body: JSON.stringify({ unitCost: 999 }),
      }),
      buildContext(otherProduct.id),
    );

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error.code).toBe("NOT_FOUND");
    expect(store.products.get(otherProduct.id)?.unitCost).toBe(otherProduct.unitCost);
  });

  it("rejects a mismatched Origin header with 403 FORBIDDEN", async () => {
    await signIn();

    const response = await detailPatch(
      new Request(`http://localhost:3000/api/products/${EXISTING_PRODUCT_ID}`, {
        method: "PATCH",
        headers: { "content-type": "application/json", origin: "http://evil.test" },
        body: JSON.stringify({ unitCost: 40000 }),
      }),
      buildContext(EXISTING_PRODUCT_ID),
    );

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error.code).toBe("FORBIDDEN");
  });
});
