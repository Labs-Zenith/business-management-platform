import { describe, expect, it } from "vitest";
import { ApiError } from "@/lib/server/api-error";
import { resetStore, store } from "@/lib/mock/store";
import type { Session } from "@/lib/services/ports";
import { createProduct, deleteProduct, getProduct, listProducts, updateProduct } from "./product-service";

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

describe("deleteProduct (product-service)", () => {
  it("removes a never-invoiced product from the store", async () => {
    resetStore();
    const created = await createProduct(SESSION, { name: "Descontinuado", unitCost: 1000 });

    await expect(deleteProduct(SESSION, created.id)).resolves.toBeUndefined();

    expect(store.products.get(created.id)).toBeUndefined();
  });

  it("throws NOT_FOUND for a cross-business delete attempt, leaving the product in place", async () => {
    resetStore();
    const created = await createProduct(SESSION, { name: "Ajeno", unitCost: 1000 });
    const otherSession: Session = { ...SESSION, businessId: OTHER_BUSINESS_ID };

    await expect(deleteProduct(otherSession, created.id)).rejects.toMatchObject({ code: "NOT_FOUND" });

    expect(store.products.get(created.id)).toBeDefined();
  });

  it("throws NOT_FOUND for an unknown id", async () => {
    resetStore();

    await expect(deleteProduct(SESSION, "90000000-0000-4000-8000-00000000dead")).rejects.toBeInstanceOf(ApiError);
  });

  /**
   * The CONFLICT message is rendered verbatim in the confirm dialog's inline
   * alert and is followed by a real "Desactivar" button, so its exact wording
   * (including singular/plural) is part of the contract.
   */
  it("throws CONFLICT naming the invoice count once the product has been sold, leaving it in place", async () => {
    resetStore();
    const created = await createProduct(SESSION, { name: "Vendido", unitCost: 1000 });
    store.invoiceItems.set("item-1", {
      id: "item-1",
      invoiceId: "invoice-1",
      description: "Vendido",
      quantity: 1,
      unitPrice: 1000,
      lineTotal: 1000,
      productId: created.id,
    });

    await expect(deleteProduct(SESSION, created.id)).rejects.toMatchObject({
      code: "CONFLICT",
      status: 409,
      message:
        "No se puede eliminar este producto porque tiene 1 factura asociada. Desactívalo en su lugar.",
      details: { invoiceCount: 1 },
    });

    expect(store.products.get(created.id)).toBeDefined();
  });

  it("uses the plural form for several invoices", async () => {
    resetStore();
    const created = await createProduct(SESSION, { name: "Vendido", unitCost: 1000 });
    for (const [itemId, invoiceId] of [["item-1", "invoice-1"], ["item-2", "invoice-2"]] as const) {
      store.invoiceItems.set(itemId, {
        id: itemId,
        invoiceId,
        description: "Vendido",
        quantity: 1,
        unitPrice: 1000,
        lineTotal: 1000,
        productId: created.id,
      });
    }

    await expect(deleteProduct(SESSION, created.id)).rejects.toMatchObject({
      message:
        "No se puede eliminar este producto porque tiene 2 facturas asociadas. Desactívalo en su lugar.",
    });
  });
});
