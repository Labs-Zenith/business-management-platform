import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetStore, store } from "@/lib/mock/store";
import { repositories } from "@/lib/services/repositories";
import { catalogProductFixtures } from "@/lib/mock/fixtures/catalog-products";
import type { CatalogProduct } from "@/lib/services/ports";

/**
 * Same in-memory cookie jar strategy as `app/api/products/products-routes.test.ts`:
 * `next/headers`'s `cookies()` only works inside a real Next.js request
 * context, so this mocks the primitive with a stateful jar shared across a
 * single test — exercises the REAL `authAdapter` -> `session.ts` -> route
 * handler -> `product-catalog-service.ts` -> `product-catalog-repo.ts` code
 * path, only faking the underlying cookie storage.
 *
 * Scoped to `DELETE` only — `GET`/`PATCH` on this route are exercised
 * elsewhere; this file's whole reason to exist is the guarded hard delete
 * (mirrors `app/api/products/[id]/route.ts`'s `DELETE` group exactly): the
 * ONE role-gated handler on this route (`deleteRecords`, admin-only), the
 * 409 refusal once a listing has been invoiced, and that deactivation
 * remains available afterward.
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

const { PATCH: detailPatch, DELETE: detailDelete } = await import("./route");

const BUSINESS_ID = "10000000-0000-4000-8000-000000000001";
const OTHER_BUSINESS_ID = "10000000-0000-4000-8000-000000000099";
const DEMO_EMAIL = "demo@negociodemo.test";
const DEMO_PASSWORD = "demo1234";
const EXISTING_PRODUCT_ID = catalogProductFixtures[0]!.id;

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
 * SAME business — same technique as `products-routes.test.ts`: this produces
 * a real worker `Session` that flows through the REAL `requireCapability` ->
 * `can()` check, unmocked.
 */
async function signInAsWorker(): Promise<void> {
  await signIn();
  const switched = await repositories.auth.switchBusiness(BUSINESS_ID, "worker");
  if (!switched) {
    throw new Error("Test setup failed: switchBusiness to worker did not succeed.");
  }
}

/** Seeds a catalog product directly under a DIFFERENT business, straight into the mock store. */
function seedOtherBusinessProduct(): CatalogProduct {
  const product: CatalogProduct = {
    id: "b0000000-0000-4000-8000-000000000998",
    businessId: OTHER_BUSINESS_ID,
    name: "Producto de otro negocio",
    category: null,
    description: null,
    pricingMode: "fixed",
    minOrderQuantity: 1,
    fixedUnitPrice: 10000,
    areaBasePrice: null,
    areaRatePerM2: null,
    areaMinPrice: null,
    active: true,
    createdAt: "2024-01-01T00:00:00.000Z",
    updatedAt: "2024-01-01T00:00:00.000Z",
  };
  store.catalogProducts.set(product.id, product);
  return product;
}

const ORIGINAL_APP_ORIGIN = process.env.APP_ORIGIN;

describe("DELETE /api/catalog-products/{id}", () => {
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
    return new Request(`http://localhost:3000/api/catalog-products/${id}`, {
      method: "DELETE",
      headers: { "content-type": "application/json", origin },
    });
  }

  it("rejects unauthenticated requests with 401 UNAUTHENTICATED, leaving the product in place", async () => {
    const response = await detailDelete(deleteRequest(EXISTING_PRODUCT_ID), buildContext(EXISTING_PRODUCT_ID));

    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.error.code).toBe("UNAUTHENTICATED");
    expect(store.catalogProducts.get(EXISTING_PRODUCT_ID)).toBeDefined();
  });

  it("rejects a worker session with 403 FORBIDDEN (lacks deleteRecords) before touching the store", async () => {
    await signInAsWorker();

    const response = await detailDelete(deleteRequest(EXISTING_PRODUCT_ID), buildContext(EXISTING_PRODUCT_ID));

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error.code).toBe("FORBIDDEN");
    expect(store.catalogProducts.get(EXISTING_PRODUCT_ID)).toBeDefined();
  });

  it("deletes for an admin session, returning {data:{ok:true}}", async () => {
    await signIn();

    const response = await detailDelete(deleteRequest(EXISTING_PRODUCT_ID), buildContext(EXISTING_PRODUCT_ID));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({ data: { ok: true } });
    expect(store.catalogProducts.get(EXISTING_PRODUCT_ID)).toBeUndefined();
  });

  it("drops the product's variants and tiers alongside it (CASCADE)", async () => {
    await signIn();
    const variantsBefore = [...store.catalogProductVariants.values()].filter(
      (variant) => variant.productId === EXISTING_PRODUCT_ID,
    );
    expect(variantsBefore.length).toBeGreaterThan(0); // guards the fixture

    await detailDelete(deleteRequest(EXISTING_PRODUCT_ID), buildContext(EXISTING_PRODUCT_ID));

    expect(
      [...store.catalogProductVariants.values()].filter((variant) => variant.productId === EXISTING_PRODUCT_ID),
    ).toHaveLength(0);
  });

  it("refuses with 409 CONFLICT once the product has been invoiced, leaving product and invoice line intact", async () => {
    await signIn();
    store.invoiceItems.set("item-under-test", {
      id: "item-under-test",
      invoiceId: "invoice-under-test",
      description: "Producto de catálogo vendido",
      quantity: 2,
      unitPrice: 2000000,
      lineTotal: 4000000,
      productId: null,
      catalogProductId: EXISTING_PRODUCT_ID,
    });

    const response = await detailDelete(deleteRequest(EXISTING_PRODUCT_ID), buildContext(EXISTING_PRODUCT_ID));

    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body.error.code).toBe("CONFLICT");
    expect(body.error.message).toContain("No se puede eliminar este producto");
    expect(body.error.message).toContain("Desactívalo en su lugar.");
    // Neither the product nor its billing history was touched.
    expect(store.catalogProducts.get(EXISTING_PRODUCT_ID)).toBeDefined();
    const item = store.invoiceItems.get("item-under-test")!;
    expect(item.catalogProductId).toBe(EXISTING_PRODUCT_ID);
    expect(item.lineTotal).toBe(4000000);
  });

  it("still allows PATCH active:false for that same product — deactivation is the way forward", async () => {
    await signIn();
    store.invoiceItems.set("item-under-test", {
      id: "item-under-test",
      invoiceId: "invoice-under-test",
      description: "Producto de catálogo vendido",
      quantity: 2,
      unitPrice: 2000000,
      lineTotal: 4000000,
      productId: null,
      catalogProductId: EXISTING_PRODUCT_ID,
    });

    const response = await detailPatch(
      new Request(`http://localhost:3000/api/catalog-products/${EXISTING_PRODUCT_ID}`, {
        method: "PATCH",
        headers: { "content-type": "application/json", origin: "http://localhost:3000" },
        body: JSON.stringify({ active: false }),
      }),
      buildContext(EXISTING_PRODUCT_ID),
    );

    expect(response.status).toBe(200);
    expect(store.catalogProducts.get(EXISTING_PRODUCT_ID)!.active).toBe(false);
  });

  it("returns 404 NOT_FOUND for an unknown id", async () => {
    await signIn();

    const unknownId = "b0000000-0000-4000-8000-00000000dead";
    const response = await detailDelete(deleteRequest(unknownId), buildContext(unknownId));

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error.code).toBe("NOT_FOUND");
  });

  it("returns 404 NOT_FOUND for a cross-business id, leaving that product untouched", async () => {
    await signIn();
    const otherProduct = seedOtherBusinessProduct();

    const response = await detailDelete(deleteRequest(otherProduct.id), buildContext(otherProduct.id));

    expect(response.status).toBe(404);
    expect(store.catalogProducts.get(otherProduct.id)).toBeDefined();
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
    expect(store.catalogProducts.get(EXISTING_PRODUCT_ID)).toBeDefined();
  });
});
