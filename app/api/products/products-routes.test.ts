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
 * Inventario has NO role gating on reads/writes (per
 * `openspec/changes/inventario/specs/inventory-tracking/spec.md`'s "No Role
 * Gating on Inventory" requirement), so GET/POST/PATCH below only prove the
 * plain-session-authenticated path plus the shared 401/cross-business/origin
 * concerns. `DELETE` is the ONE exception — it is gated on the admin-only
 * `deleteRecords` capability — so that group additionally proves the
 * worker-403 path, mirroring `app/api/employees/employees-routes.test.ts`.
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

/**
 * Signs in, then re-issues the session cookie with role `"worker"` in the
 * SAME business — same technique as `employees-routes.test.ts`: this produces
 * a real worker `Session` that flows through the REAL `requireCapability` ->
 * `permissions.can()` check, unmocked.
 */
async function signInAsWorker(): Promise<void> {
  await signIn();
  const switched = await repositories.auth.switchBusiness(BUSINESS_ID, "worker");
  if (!switched) {
    throw new Error("Test setup failed: switchBusiness to worker did not succeed.");
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

    const response = await listPost(postRequest({ name: "Crema Facial", sku: "CRE-005", unitCost: 30000 }));

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.data.name).toBe("Crema Facial");
    expect(body.data.sku).toBe("CRE-005");
    expect(body.data.unitCost).toBe(30000);
    expect(body.data.active).toBe(true);
    expect(body.data.businessId).toBe(BUSINESS_ID);
  });

  it("rejects a minStockThreshold field — removed (Wave 1A): low-stock is a fixed rule, not a per-product value", async () => {
    await signIn();

    const response = await listPost(
      postRequest({ name: "Crema Facial", sku: "CRE-005", unitCost: 30000, minStockThreshold: 5 }),
    );

    expect(response.status).toBe(400);
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

/**
 * The ONLY role-gated handler in Inventario. `deleteRecords` is admin-only,
 * so a worker must be refused BEFORE anything is touched, while the rest of
 * the module stays open to them (proved by the PATCH group above, which
 * signs in with no role manipulation at all).
 *
 * The delete itself is guarded: a product that has already been sold is
 * refused with a `CONFLICT` naming the invoice count, so billing history is
 * never destroyed by a catalog edit. The UI then offers deactivation.
 */
describe("DELETE /api/products/{id}", () => {
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

  function deleteRequest(id: string, origin = "http://localhost:3000") {
    return new Request(`http://localhost:3000/api/products/${id}`, {
      method: "DELETE",
      headers: { "content-type": "application/json", origin },
    });
  }

  it("rejects unauthenticated requests with 401 UNAUTHENTICATED, leaving the product in place", async () => {
    const response = await detailDelete(
      deleteRequest(EXISTING_PRODUCT_ID),
      buildContext(EXISTING_PRODUCT_ID),
    );

    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.error.code).toBe("UNAUTHENTICATED");
    expect(store.products.get(EXISTING_PRODUCT_ID)).toBeDefined();
  });

  it("rejects a worker session with 403 FORBIDDEN (lacks deleteRecords) before touching the store", async () => {
    await signInAsWorker();

    const response = await detailDelete(
      deleteRequest(EXISTING_PRODUCT_ID),
      buildContext(EXISTING_PRODUCT_ID),
    );

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error.code).toBe("FORBIDDEN");
    expect(store.products.get(EXISTING_PRODUCT_ID)).toBeDefined();
  });

  it("deletes for an admin session, returning {data:{ok:true}}", async () => {
    await signIn();

    const response = await detailDelete(
      deleteRequest(EXISTING_PRODUCT_ID),
      buildContext(EXISTING_PRODUCT_ID),
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({ data: { ok: true } });
    expect(store.products.get(EXISTING_PRODUCT_ID)).toBeUndefined();
  });

  it("drops the product's inventory movements alongside it", async () => {
    await signIn();
    const movementsBefore = [...store.inventoryMovements.values()].filter(
      (movement) => movement.productId === EXISTING_PRODUCT_ID,
    );
    expect(movementsBefore.length).toBeGreaterThan(0); // guards the fixture

    await detailDelete(deleteRequest(EXISTING_PRODUCT_ID), buildContext(EXISTING_PRODUCT_ID));

    expect(
      [...store.inventoryMovements.values()].filter((m) => m.productId === EXISTING_PRODUCT_ID),
    ).toHaveLength(0);
  });

  it("refuses with 409 CONFLICT once the product has been invoiced, leaving product and invoice line intact", async () => {
    await signIn();
    store.invoiceItems.set("item-under-test", {
      id: "item-under-test",
      invoiceId: "invoice-under-test",
      description: "Producto vendido",
      quantity: 2,
      unitPrice: 25000,
      lineTotal: 50000,
      productId: EXISTING_PRODUCT_ID,
    });

    const response = await detailDelete(
      deleteRequest(EXISTING_PRODUCT_ID),
      buildContext(EXISTING_PRODUCT_ID),
    );

    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body.error.code).toBe("CONFLICT");
    expect(body.error.message).toContain("No se puede eliminar este producto");
    expect(body.error.message).toContain("Desactívalo en su lugar.");
    // Neither the product nor its billing history was touched.
    expect(store.products.get(EXISTING_PRODUCT_ID)).toBeDefined();
    const item = store.invoiceItems.get("item-under-test")!;
    expect(item.productId).toBe(EXISTING_PRODUCT_ID);
    expect(item.lineTotal).toBe(50000);
  });

  it("still allows PATCH active:false for that same product — deactivation is the way forward", async () => {
    await signIn();
    store.invoiceItems.set("item-under-test", {
      id: "item-under-test",
      invoiceId: "invoice-under-test",
      description: "Producto vendido",
      quantity: 2,
      unitPrice: 25000,
      lineTotal: 50000,
      productId: EXISTING_PRODUCT_ID,
    });

    const response = await detailPatch(
      new Request(`http://localhost:3000/api/products/${EXISTING_PRODUCT_ID}`, {
        method: "PATCH",
        headers: { "content-type": "application/json", origin: "http://localhost:3000" },
        body: JSON.stringify({ active: false }),
      }),
      buildContext(EXISTING_PRODUCT_ID),
    );

    expect(response.status).toBe(200);
    expect(store.products.get(EXISTING_PRODUCT_ID)!.active).toBe(false);
  });

  it("returns 404 NOT_FOUND for an unknown id", async () => {
    await signIn();

    const unknownId = "90000000-0000-4000-8000-00000000dead";
    const response = await detailDelete(deleteRequest(unknownId), buildContext(unknownId));

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error.code).toBe("NOT_FOUND");
  });

  it("returns 404 NOT_FOUND for a cross-business id, leaving that product untouched", async () => {
    await signIn();
    const otherProduct = seedOtherBusinessProduct();

    const response = await detailDelete(
      deleteRequest(otherProduct.id),
      buildContext(otherProduct.id),
    );

    expect(response.status).toBe(404);
    expect(store.products.get(otherProduct.id)).toBeDefined();
  });

  it("rejects a mismatched Origin header with 403 FORBIDDEN", async () => {
    await signIn();

    const response = await detailDelete(
      deleteRequest(EXISTING_PRODUCT_ID, "http://evil.test"),
      buildContext(EXISTING_PRODUCT_ID),
    );

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error.code).toBe("FORBIDDEN");
    expect(store.products.get(EXISTING_PRODUCT_ID)).toBeDefined();
  });
});
