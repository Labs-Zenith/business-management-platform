import { beforeEach, describe, expect, it } from "vitest";
import { ApiError } from "@/lib/server/api-error";
import { createInventoryMovementRepository } from "./inventory-repo";
import { createProductRepository } from "./product-repo";
import { createEmptyStore, type MockStore } from "./store";

/**
 * Mirrors `lib/mock/payment-repo.test.ts`'s safety-critical proof technique
 * (real concurrency via `Promise.allSettled`, not sequential awaits) adapted
 * for the floor-at-zero guard on `out` movements.
 */

const BUSINESS_ID = "10000000-0000-4000-8000-000000000001";
const OTHER_BUSINESS_ID = "10000000-0000-4000-8000-000000000099";

let store: MockStore;

beforeEach(() => {
  store = createEmptyStore();
});

async function seedProduct(businessId = BUSINESS_ID, unitCost = 1000, minStockThreshold = 0) {
  const productRepo = createProductRepository(store);
  return productRepo.create(businessId, { name: "Producto de prueba", unitCost, minStockThreshold });
}

describe("createInventoryMovementRepository.create — append-only", () => {
  it("persists an in movement under businessId", async () => {
    const repo = createInventoryMovementRepository(store);
    const product = await seedProduct();

    const movement = await repo.create(BUSINESS_ID, { productId: product.id, type: "in", quantity: 10 });

    expect(movement.businessId).toBe(BUSINESS_ID);
    expect(movement.productId).toBe(product.id);
    expect(movement.type).toBe("in");
    expect(movement.quantity).toBe(10);
    expect(store.inventoryMovements.get(movement.id)).toEqual(movement);
  });

  it("stores note as null when omitted", async () => {
    const repo = createInventoryMovementRepository(store);
    const product = await seedProduct();

    const movement = await repo.create(BUSINESS_ID, { productId: product.id, type: "in", quantity: 5 });

    expect(movement.note).toBeNull();
  });

  it("throws NOT_FOUND for a product belonging to another business, mutating nothing", async () => {
    const repo = createInventoryMovementRepository(store);
    const product = await seedProduct(OTHER_BUSINESS_ID);

    await expect(repo.create(BUSINESS_ID, { productId: product.id, type: "in", quantity: 5 })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    expect(store.inventoryMovements.size).toBe(0);
  });

  it("has no update or delete operation on the repository interface", async () => {
    const repo = createInventoryMovementRepository(store);
    expect((repo as unknown as Record<string, unknown>).update).toBeUndefined();
    expect((repo as unknown as Record<string, unknown>).delete).toBeUndefined();
  });
});

describe("createInventoryMovementRepository.create — floor-at-zero guard (safety-critical)", () => {
  it("succeeds when an out movement exactly matches the current computed quantity, driving it to 0", async () => {
    const repo = createInventoryMovementRepository(store);
    const product = await seedProduct();
    await repo.create(BUSINESS_ID, { productId: product.id, type: "in", quantity: 5 });

    const movement = await repo.create(BUSINESS_ID, { productId: product.id, type: "out", quantity: 5 });

    expect(movement.type).toBe("out");
    const productRepo = createProductRepository(store);
    const found = await productRepo.getById(BUSINESS_ID, product.id);
    expect(found!.currentQuantity).toBe(0);
  });

  it("rejects an out movement exceeding the current computed quantity WITH ZERO MUTATION", async () => {
    const repo = createInventoryMovementRepository(store);
    const product = await seedProduct();
    await repo.create(BUSINESS_ID, { productId: product.id, type: "in", quantity: 5 });
    const movementCountBefore = store.inventoryMovements.size;

    await expect(
      repo.create(BUSINESS_ID, { productId: product.id, type: "out", quantity: 6 }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });

    // Not just "the response is an error" — the store itself is unchanged.
    expect(store.inventoryMovements.size).toBe(movementCountBefore);
    const productRepo = createProductRepository(store);
    const found = await productRepo.getById(BUSINESS_ID, product.id);
    expect(found!.currentQuantity).toBe(5);
  });

  it("propagates ApiError instances (not generic Errors)", async () => {
    const repo = createInventoryMovementRepository(store);
    const product = await seedProduct();

    await expect(repo.create(BUSINESS_ID, { productId: product.id, type: "out", quantity: 1 })).rejects.toBeInstanceOf(
      ApiError,
    );
  });

  it("accepts exactly one of two concurrent out movements that individually fit but combined exceed stock, and quantity never goes negative", async () => {
    const repo = createInventoryMovementRepository(store);
    const product = await seedProduct();
    await repo.create(BUSINESS_ID, { productId: product.id, type: "in", quantity: 10 });

    // Fire genuinely concurrent movement registrations via
    // Promise.allSettled — NOT sequential awaits, which would trivially
    // avoid any race — mirrors `lib/mock/payment-repo.test.ts`'s technique.
    const [first, second] = await Promise.allSettled([
      repo.create(BUSINESS_ID, { productId: product.id, type: "out", quantity: 7 }),
      repo.create(BUSINESS_ID, { productId: product.id, type: "out", quantity: 7 }),
    ]);

    const settled = [first, second];
    const fulfilled = settled.filter((r) => r.status === "fulfilled");
    const rejected = settled.filter((r): r is PromiseRejectedResult => r.status === "rejected");

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0]?.reason as ApiError).code).toBe("VALIDATION_ERROR");

    const productRepo = createProductRepository(store);
    const found = await productRepo.getById(BUSINESS_ID, product.id);
    // Only the winning 7-unit out movement was ever recorded.
    expect(found!.currentQuantity).toBe(3);
    expect(found!.currentQuantity).toBeGreaterThanOrEqual(0);
  });
});

describe("createInventoryMovementRepository.getById/list — business_id scoping", () => {
  it("returns the movement with the joined product name when it belongs to the requesting business", async () => {
    const repo = createInventoryMovementRepository(store);
    const product = await seedProduct();
    const movement = await repo.create(BUSINESS_ID, { productId: product.id, type: "in", quantity: 5 });

    const found = await repo.getById(BUSINESS_ID, movement.id);

    expect(found).not.toBeNull();
    expect(found!.product.id).toBe(product.id);
    expect(found!.product.name).toBe("Producto de prueba");
  });

  it("returns null (not a leaked record) for a movement belonging to another business", async () => {
    const repo = createInventoryMovementRepository(store);
    const product = await seedProduct();
    const movement = await repo.create(BUSINESS_ID, { productId: product.id, type: "in", quantity: 5 });

    const found = await repo.getById(OTHER_BUSINESS_ID, movement.id);

    expect(found).toBeNull();
  });

  it("list returns only movements scoped to businessId", async () => {
    const repo = createInventoryMovementRepository(store);
    const product = await seedProduct();
    const otherProduct = await seedProduct(OTHER_BUSINESS_ID);
    await repo.create(BUSINESS_ID, { productId: product.id, type: "in", quantity: 5 });
    await repo.create(OTHER_BUSINESS_ID, { productId: otherProduct.id, type: "in", quantity: 5 });

    const result = await repo.list(BUSINESS_ID, { page: 1, pageSize: 20 });

    expect(result.total).toBe(1);
    expect(result.data.every((m) => m.businessId === BUSINESS_ID)).toBe(true);
  });

  it("list filters by productId and type", async () => {
    const repo = createInventoryMovementRepository(store);
    const product = await seedProduct();
    await repo.create(BUSINESS_ID, { productId: product.id, type: "in", quantity: 5 });
    await repo.create(BUSINESS_ID, { productId: product.id, type: "out", quantity: 2 });

    const inOnly = await repo.list(BUSINESS_ID, { page: 1, pageSize: 20, type: "in" });
    const byProduct = await repo.list(BUSINESS_ID, { page: 1, pageSize: 20, productId: product.id });

    expect(inOnly.data).toHaveLength(1);
    expect(inOnly.data[0]!.type).toBe("in");
    expect(byProduct.total).toBe(2);
  });
});
