import { describe, expect, it } from "vitest";
import { ApiError } from "@/lib/server/api-error";
import { resetStore, store } from "@/lib/mock/store";
import { repositories } from "@/lib/services/repositories";
import type { Session } from "@/lib/services/ports";
import { createProduct } from "./product-service";
import { listMovements, recordMovement } from "./inventory-service";

/**
 * SAFETY-CRITICAL: mirrors `payment-service.test.ts`'s technique — exercises
 * the REAL mock store (not a mocked repository), so "the store is left
 * completely unchanged" on rejection is an observable fact, not just an
 * assertion about the thrown error.
 */

const BUSINESS_ID = "10000000-0000-4000-8000-000000000001";
const OTHER_BUSINESS_ID = "10000000-0000-4000-8000-000000000099";

const SESSION: Session = {
  userId: "20000000-0000-4000-8000-000000000001",
  businessId: BUSINESS_ID,
  email: "demo@negociodemo.test",
  role: "admin",
};

describe("recordMovement (inventory-service) — quantity pre-validation", () => {
  it("rejects a zero quantity with VALIDATION_ERROR before reaching the repository", async () => {
    resetStore();
    const product = await createProduct(SESSION, { name: "Producto", unitCost: 1000 });
    const movementCountBefore = store.inventoryMovements.size;

    await expect(
      recordMovement(SESSION, { productId: product.id, type: "in", quantity: 0 }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect(store.inventoryMovements.size).toBe(movementCountBefore);
  });

  it("rejects a negative quantity with VALIDATION_ERROR before reaching the repository", async () => {
    resetStore();
    const product = await createProduct(SESSION, { name: "Producto", unitCost: 1000 });

    await expect(
      recordMovement(SESSION, { productId: product.id, type: "in", quantity: -5 }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("rejects a non-integer quantity with VALIDATION_ERROR before reaching the repository", async () => {
    resetStore();
    const product = await createProduct(SESSION, { name: "Producto", unitCost: 1000 });

    await expect(
      recordMovement(SESSION, { productId: product.id, type: "in", quantity: 1.5 }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("propagates ApiError instances (not generic Errors) for invalid quantity", async () => {
    resetStore();
    const product = await createProduct(SESSION, { name: "Producto", unitCost: 1000 });

    await expect(recordMovement(SESSION, { productId: product.id, type: "in", quantity: 0 })).rejects.toBeInstanceOf(
      ApiError,
    );
  });
});

describe("recordMovement (inventory-service) — passes through repo behavior unchanged", () => {
  it("persists a valid in movement, scoped to session.businessId", async () => {
    resetStore();
    const product = await createProduct(SESSION, { name: "Producto", unitCost: 1000 });

    const movement = await recordMovement(SESSION, { productId: product.id, type: "in", quantity: 10 });

    expect(movement.businessId).toBe(BUSINESS_ID);
    expect(store.inventoryMovements.get(movement.id)).toBeDefined();
  });

  it("passes through the repo's floor-at-zero rejection unchanged, mutating nothing", async () => {
    resetStore();
    const product = await createProduct(SESSION, { name: "Producto", unitCost: 1000 });
    await recordMovement(SESSION, { productId: product.id, type: "in", quantity: 5 });
    const movementCountBefore = store.inventoryMovements.size;

    await expect(
      recordMovement(SESSION, { productId: product.id, type: "out", quantity: 6 }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });

    expect(store.inventoryMovements.size).toBe(movementCountBefore);
  });

  it("passes through the repo's NOT_FOUND for a cross-business product id, creating nothing", async () => {
    resetStore();
    const product = await createProduct(SESSION, { name: "Producto", unitCost: 1000 });
    const otherSession: Session = { ...SESSION, businessId: OTHER_BUSINESS_ID };
    const movementCountBefore = store.inventoryMovements.size;

    await expect(
      recordMovement(otherSession, { productId: product.id, type: "in", quantity: 5 }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    // Not just "the response is an error" — no movement was ever created
    // (the store's movement count is unchanged), regardless of any
    // pre-existing/fixture-seeded movements.
    expect(store.inventoryMovements.size).toBe(movementCountBefore);
  });

  it("accepts a well-formed typeId that actually exists in the movement_types catalog", async () => {
    resetStore();
    const product = await createProduct(SESSION, { name: "Producto", unitCost: 1000 });
    const [existingType] = await repositories.catalog.listMovementTypes();

    const movement = await recordMovement(SESSION, {
      productId: product.id,
      type: "in",
      quantity: 5,
      typeId: existingType!.id,
    });

    expect(movement.typeId).toBe(existingType!.id);
  });

  it("rejects a well-formed but nonexistent typeId with VALIDATION_ERROR, creating nothing", async () => {
    resetStore();
    const product = await createProduct(SESSION, { name: "Producto", unitCost: 1000 });
    const movementCountBefore = store.inventoryMovements.size;

    await expect(
      recordMovement(SESSION, {
        productId: product.id,
        type: "in",
        quantity: 5,
        typeId: "c4000000-0000-4000-8000-000000000099",
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect(store.inventoryMovements.size).toBe(movementCountBefore);
  });
});

describe("listMovements (inventory-service)", () => {
  it("lists only the session business's movements", async () => {
    resetStore();
    const product = await createProduct(SESSION, { name: "Propio", unitCost: 1000 });
    const otherSession: Session = { ...SESSION, businessId: OTHER_BUSINESS_ID };
    const otherProduct = await createProduct(otherSession, { name: "Ajeno", unitCost: 1000 });
    await recordMovement(SESSION, { productId: product.id, type: "in", quantity: 5 });
    await recordMovement(otherSession, { productId: otherProduct.id, type: "in", quantity: 5 });

    const result = await listMovements(SESSION, { page: 1, pageSize: 20 });

    expect(result.data.every((m) => m.businessId === BUSINESS_ID)).toBe(true);
  });
});
