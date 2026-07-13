import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetStore, store } from "@/lib/mock/store";
import { repositories } from "@/lib/services/repositories";
import { inventoryMovementFixtures, productFixtures } from "@/lib/mock/fixtures/data";
import type { InventoryMovement, Product } from "@/lib/services/ports";

/**
 * Same in-memory cookie jar strategy as
 * `app/api/products/products-routes.test.ts` — exercises the REAL
 * `authAdapter` -> `session.ts` -> route handler -> `inventory-service.ts` ->
 * `inventory-repo.ts` code path (including the floor-at-zero atomic guard),
 * only faking the underlying cookie storage. No role gating here (per
 * `openspec/changes/inventario/specs/inventory-tracking/spec.md`'s "No Role
 * Gating on Inventory" requirement), so there is no worker-403 path.
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

const BUSINESS_ID = "10000000-0000-4000-8000-000000000001";
const OTHER_BUSINESS_ID = "10000000-0000-4000-8000-000000000099";
const DEMO_EMAIL = "demo@negociodemo.test";
const DEMO_PASSWORD = "demo1234";

// Product 2 (Tijera de Corte): +5 -4 = 1 unit currently in stock (see
// `lib/mock/fixtures/data.ts`'s inventoryMovementFixtures comment).
const LOW_STOCK_PRODUCT_ID = productFixtures[1]!.id;

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

/**
 * Reads the CURRENT computed quantity for a product directly off the store
 * (in - out over all its movements), rather than hardcoding the fixture's
 * initial value. `resetStore()` in this block's `beforeEach` now genuinely
 * re-seeds the shared store IN PLACE before every test (see `lib/mock/
 * store.ts`), so each test starts from the pristine fixture stock and no
 * state leaks across tests. Reading the quantity live simply keeps these
 * assertions decoupled from the exact seed numbers and readable.
 */
function currentQuantityOf(productId: string): number {
  return [...store.inventoryMovements.values()]
    .filter((movement) => movement.productId === productId && movement.businessId === BUSINESS_ID)
    .reduce((qty, movement) => qty + (movement.type === "in" ? movement.quantity : -movement.quantity), 0);
}

/** Seeds a movement directly under a DIFFERENT business, straight into the mock store. */
function seedOtherBusinessMovement(productId: string): InventoryMovement {
  const movement: InventoryMovement = {
    id: "a0000000-0000-4000-8000-000000000998",
    businessId: OTHER_BUSINESS_ID,
    productId,
    type: "in",
    quantity: 100,
    note: null,
    createdAt: "2024-01-01T00:00:00.000Z",
  };
  store.inventoryMovements.set(movement.id, movement);
  return movement;
}

const ORIGINAL_APP_ORIGIN = process.env.APP_ORIGIN;

describe("GET /api/inventory-movements", () => {
  beforeEach(() => {
    resetStore();
    mockCookieJar.clear();
  });

  it("rejects unauthenticated requests with 401 UNAUTHENTICATED", async () => {
    const response = await listGet(new Request("http://localhost:3000/api/inventory-movements"));

    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.error.code).toBe("UNAUTHENTICATED");
  });

  it("returns only the session business's movements, paginated, with Cache-Control: no-store and product names attached", async () => {
    await signIn();
    const otherProduct = seedOtherBusinessProduct();
    const otherMovement = seedOtherBusinessMovement(otherProduct.id);

    const response = await listGet(new Request("http://localhost:3000/api/inventory-movements?page=1&pageSize=50"));

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const body = await response.json();
    expect(body.data.length).toBe(inventoryMovementFixtures.length);
    expect(body.data.every((m: { id: string }) => m.id !== otherMovement.id)).toBe(true);
    expect(body.data.every((m: { product: { name: string } }) => typeof m.product.name === "string")).toBe(true);
  });

  it("filters by productId and type", async () => {
    await signIn();

    const response = await listGet(
      new Request(`http://localhost:3000/api/inventory-movements?productId=${LOW_STOCK_PRODUCT_ID}&type=out&pageSize=50`),
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.length).toBeGreaterThan(0);
    expect(
      body.data.every((m: { productId: string; type: string }) => m.productId === LOW_STOCK_PRODUCT_ID && m.type === "out"),
    ).toBe(true);
  });

  it("rejects an invalid type query parameter with 400 VALIDATION_ERROR", async () => {
    await signIn();

    const response = await listGet(new Request("http://localhost:3000/api/inventory-movements?type=sideways"));

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });
});

describe("POST /api/inventory-movements", () => {
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
    return new Request("http://localhost:3000/api/inventory-movements", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "http://localhost:3000", ...headers },
      body: JSON.stringify(body),
    });
  }

  it("rejects unauthenticated requests with 401 UNAUTHENTICATED", async () => {
    const response = await listPost(
      postRequest({ productId: LOW_STOCK_PRODUCT_ID, type: "in", quantity: 5 }),
    );

    expect(response.status).toBe(401);
  });

  it("records an 'in' movement for an authenticated session", async () => {
    await signIn();

    const response = await listPost(
      postRequest({ productId: LOW_STOCK_PRODUCT_ID, type: "in", quantity: 5, note: "Reposicion" }),
    );

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.data.productId).toBe(LOW_STOCK_PRODUCT_ID);
    expect(body.data.type).toBe("in");
    expect(body.data.quantity).toBe(5);
    expect(body.data.businessId).toBe(BUSINESS_ID);
  });

  it("records an 'out' movement within stock for an authenticated session", async () => {
    await signIn();
    const available = currentQuantityOf(LOW_STOCK_PRODUCT_ID);

    const response = await listPost(postRequest({ productId: LOW_STOCK_PRODUCT_ID, type: "out", quantity: available }));

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.data.type).toBe("out");
    expect(body.data.quantity).toBe(available);
    expect(currentQuantityOf(LOW_STOCK_PRODUCT_ID)).toBe(0);
  });

  it("rejects an 'out' movement exceeding current stock with 400 VALIDATION_ERROR and NO mutation", async () => {
    await signIn();
    const movementsBefore = store.inventoryMovements.size;
    const available = currentQuantityOf(LOW_STOCK_PRODUCT_ID);

    const response = await listPost(
      postRequest({ productId: LOW_STOCK_PRODUCT_ID, type: "out", quantity: available + 1 }),
    );

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(store.inventoryMovements.size).toBe(movementsBefore);
    expect(currentQuantityOf(LOW_STOCK_PRODUCT_ID)).toBe(available);
  });

  it("rejects a zero/negative/non-integer quantity with 400 VALIDATION_ERROR, creating nothing", async () => {
    await signIn();
    const movementsBefore = store.inventoryMovements.size;

    const zero = await listPost(postRequest({ productId: LOW_STOCK_PRODUCT_ID, type: "in", quantity: 0 }));
    expect(zero.status).toBe(400);

    const fractional = await listPost(postRequest({ productId: LOW_STOCK_PRODUCT_ID, type: "in", quantity: 1.5 }));
    expect(fractional.status).toBe(400);

    expect(store.inventoryMovements.size).toBe(movementsBefore);
  });

  it("rejects (via strict schema) a forged business_id with 400 VALIDATION_ERROR, creating nothing", async () => {
    await signIn();
    const movementsBefore = store.inventoryMovements.size;

    const response = await listPost(
      postRequest({ productId: LOW_STOCK_PRODUCT_ID, type: "in", quantity: 5, business_id: OTHER_BUSINESS_ID }),
    );

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(store.inventoryMovements.size).toBe(movementsBefore);
  });

  it("returns 404 NOT_FOUND when recording a movement against another business's product, creating nothing", async () => {
    await signIn();
    const otherProduct = seedOtherBusinessProduct();
    const movementsBefore = store.inventoryMovements.size;

    const response = await listPost(postRequest({ productId: otherProduct.id, type: "in", quantity: 5 }));

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error.code).toBe("NOT_FOUND");
    expect(store.inventoryMovements.size).toBe(movementsBefore);
  });

  it("rejects a mismatched Origin header with 403 FORBIDDEN before touching the store", async () => {
    await signIn();

    const response = await listPost(
      postRequest(
        { productId: LOW_STOCK_PRODUCT_ID, type: "in", quantity: 5 },
        { origin: "http://evil.test" },
      ),
    );

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error.code).toBe("FORBIDDEN");
  });
});
