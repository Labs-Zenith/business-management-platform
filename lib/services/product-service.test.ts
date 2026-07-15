import { describe, expect, it } from "vitest";
import { ApiError } from "@/lib/server/api-error";
import { resetStore, store } from "@/lib/mock/store";
import type { Session } from "@/lib/services/ports";
import { createProduct, getProduct, listProducts, updateProduct } from "./product-service";

/**
 * Mirrors `employee-service.test.ts`'s technique: exercises the REAL mock
 * store (not a mocked repository) so business_id scoping is an observable
 * fact, not just an assertion about a thrown error.
 */

const BUSINESS_ID = "10000000-0000-4000-8000-000000000001";
const OTHER_BUSINESS_ID = "10000000-0000-4000-8000-000000000099";

const SESSION: Session = {
  userId: "20000000-0000-4000-8000-000000000001",
  businessId: BUSINESS_ID,
  email: "demo@negociodemo.test",
  role: "admin",
};

describe("createProduct (product-service)", () => {
  it("ALWAYS derives businessId from the session and creates the product active", async () => {
    resetStore();

    const product = await createProduct(SESSION, { name: "Shampoo", unitCost: 25000 });

    expect(product.businessId).toBe(BUSINESS_ID);
    expect(product.active).toBe(true);
    expect(store.products.get(product.id)).toBeDefined();
  });
});

describe("getProduct (product-service)", () => {
  it("returns the product with computed stock when it belongs to the session's business", async () => {
    resetStore();
    const created = await createProduct(SESSION, { name: "Consultable", unitCost: 1000 });

    const found = await getProduct(SESSION, created.id);

    expect(found.id).toBe(created.id);
    expect(found.currentQuantity).toBe(0);
    expect(found.totalValue).toBe(0);
  });

  it("throws NOT_FOUND for a cross-business product id, never leaking the record", async () => {
    resetStore();
    const created = await createProduct(SESSION, { name: "De otro negocio", unitCost: 1000 });
    const otherSession: Session = { ...SESSION, businessId: OTHER_BUSINESS_ID };

    await expect(getProduct(otherSession, created.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("throws NOT_FOUND for a missing product id", async () => {
    resetStore();

    await expect(getProduct(SESSION, "00000000-0000-4000-8000-000000000000")).rejects.toBeInstanceOf(ApiError);
  });
});

describe("listProducts (product-service)", () => {
  it("lists only the session business's products", async () => {
    resetStore();
    await createProduct(SESSION, { name: "Propio", unitCost: 1000 });
    const otherSession: Session = { ...SESSION, businessId: OTHER_BUSINESS_ID };
    await createProduct(otherSession, { name: "Ajeno", unitCost: 1000 });

    const result = await listProducts(SESSION, { page: 1, pageSize: 20 });

    expect(result.data.every((p) => p.businessId === BUSINESS_ID)).toBe(true);
    expect(result.data.some((p) => p.name === "Ajeno")).toBe(false);
  });
});

describe("updateProduct (product-service)", () => {
  it("forwards only name/sku/unitCost/active to the repository, ignoring forged fields", async () => {
    resetStore();
    const created = await createProduct(SESSION, { name: "Original", unitCost: 1000 });
    const forgedData = {
      name: "Actualizado",
      businessId: OTHER_BUSINESS_ID,
    } as unknown as Parameters<typeof updateProduct>[2];

    const updated = await updateProduct(SESSION, created.id, forgedData);

    expect(updated.name).toBe("Actualizado");
    expect(updated.businessId).toBe(BUSINESS_ID);
  });

  it("throws NOT_FOUND for a cross-business update attempt", async () => {
    resetStore();
    const created = await createProduct(SESSION, { name: "Original", unitCost: 1000 });
    const otherSession: Session = { ...SESSION, businessId: OTHER_BUSINESS_ID };

    await expect(updateProduct(otherSession, created.id, { name: "Hijacked" })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("toggles active without touching name/unitCost when only active is provided", async () => {
    resetStore();
    const created = await createProduct(SESSION, { name: "Original", unitCost: 1000 });

    const updated = await updateProduct(SESSION, created.id, { active: false });

    expect(updated.active).toBe(false);
    expect(updated.name).toBe("Original");
    expect(updated.unitCost).toBe(1000);
  });
});
