import { beforeEach, describe, expect, it } from "vitest";
import type { ProductCreate } from "@/lib/services/ports";
import { createProductRepository } from "./product-repo";
import { createInventoryMovementRepository } from "./inventory-repo";
import { createEmptyStore, type MockStore } from "./store";

/**
 * Mirrors `lib/mock/employee-repo.test.ts`'s scope (business_id scoping,
 * editable-CRUD, no delete), extended with an INTEGRATION-level proof that
 * this repo correctly groups `store.inventoryMovements` per product before
 * delegating to the shared `computeProductStock` (`lib/services/
 * inventory-stock.ts`). The pure low-stock boundary math itself (exactly at/
 * one below/one above threshold) is NOT re-tested here — see
 * `lib/services/inventory-stock.test.ts`, the single source of truth for
 * that coverage (also relied on by `lib/db/product-repo.test.ts`, keeping
 * both repos' test files symmetrically thin).
 */

const BUSINESS_ID = "10000000-0000-4000-8000-000000000001";
const OTHER_BUSINESS_ID = "10000000-0000-4000-8000-000000000099";

function buildInput(overrides: Partial<ProductCreate> = {}): ProductCreate {
  return {
    name: "Shampoo Profesional",
    sku: "SHP-001",
    unitCost: 25000,
    ...overrides,
  };
}

let store: MockStore;

beforeEach(() => {
  store = createEmptyStore();
});

describe("createProductRepository.create", () => {
  it("persists the product under businessId with active = true", async () => {
    const repo = createProductRepository(store);

    const product = await repo.create(BUSINESS_ID, buildInput());

    expect(product.businessId).toBe(BUSINESS_ID);
    expect(product.name).toBe("Shampoo Profesional");
    expect(product.sku).toBe("SHP-001");
    expect(product.unitCost).toBe(25000);
    expect(product.active).toBe(true);
    expect(store.products.get(product.id)).toEqual(product);
  });

  it("stores sku as null when omitted", async () => {
    const repo = createProductRepository(store);

    const product = await repo.create(BUSINESS_ID, { name: "Sin SKU", unitCost: 5000 });

    expect(product.sku).toBeNull();
  });

  it("accepts a duplicate sku within the same business without error (no uniqueness constraint)", async () => {
    const repo = createProductRepository(store);
    await repo.create(BUSINESS_ID, buildInput({ sku: "ABC123" }));

    const second = await repo.create(BUSINESS_ID, buildInput({ name: "Otro producto", sku: "ABC123" }));

    expect(second.sku).toBe("ABC123");
  });
});

describe("createProductRepository.getById — business_id scoping", () => {
  it("returns the product when it belongs to the requesting business", async () => {
    const repo = createProductRepository(store);
    const created = await repo.create(BUSINESS_ID, buildInput());

    const found = await repo.getById(BUSINESS_ID, created.id);

    expect(found).not.toBeNull();
    expect(found!.id).toBe(created.id);
  });

  it("returns null (not a leaked record) for a product belonging to another business", async () => {
    const repo = createProductRepository(store);
    const created = await repo.create(BUSINESS_ID, buildInput());

    const found = await repo.getById(OTHER_BUSINESS_ID, created.id);

    expect(found).toBeNull();
  });

  it("returns null for a missing product id", async () => {
    const repo = createProductRepository(store);

    const found = await repo.getById(BUSINESS_ID, "00000000-0000-4000-8000-000000000000");

    expect(found).toBeNull();
  });
});

describe("createProductRepository.update", () => {
  it("applies name/sku/unitCost/active updates", async () => {
    const repo = createProductRepository(store);
    const created = await repo.create(BUSINESS_ID, buildInput());

    const updated = await repo.update(BUSINESS_ID, created.id, {
      name: "Shampoo Premium",
      sku: "SHP-002",
      unitCost: 30000,
      active: false,
    });

    expect(updated).not.toBeNull();
    expect(updated!.name).toBe("Shampoo Premium");
    expect(updated!.sku).toBe("SHP-002");
    expect(updated!.unitCost).toBe(30000);
    expect(updated!.active).toBe(false);
  });

  it("returns null for cross-business update attempts, leaving the record unchanged", async () => {
    const repo = createProductRepository(store);
    const created = await repo.create(BUSINESS_ID, buildInput());

    const result = await repo.update(OTHER_BUSINESS_ID, created.id, { name: "Hijacked" });

    expect(result).toBeNull();
    expect(store.products.get(created.id)!.name).toBe("Shampoo Profesional");
  });

  it("has no delete operation — only the active toggle exists on the repository interface", async () => {
    const repo = createProductRepository(store);
    expect((repo as unknown as Record<string, unknown>).delete).toBeUndefined();
  });
});

describe("createProductRepository — computed stock (currentQuantity/totalValue/isLowStock)", () => {
  it("nets 3 in-movements + 2 out-movements to the correct remaining quantity and total value", async () => {
    const productRepo = createProductRepository(store);
    const movementRepo = createInventoryMovementRepository(store);
    const product = await productRepo.create(BUSINESS_ID, buildInput({ unitCost: 1000 }));

    await movementRepo.create(BUSINESS_ID, { productId: product.id, type: "in", quantity: 10 });
    await movementRepo.create(BUSINESS_ID, { productId: product.id, type: "in", quantity: 5 });
    await movementRepo.create(BUSINESS_ID, { productId: product.id, type: "in", quantity: 3 });
    await movementRepo.create(BUSINESS_ID, { productId: product.id, type: "out", quantity: 4 });
    await movementRepo.create(BUSINESS_ID, { productId: product.id, type: "out", quantity: 2 });

    const found = await productRepo.getById(BUSINESS_ID, product.id);

    // 10 + 5 + 3 - 4 - 2 = 12
    expect(found!.currentQuantity).toBe(12);
    expect(found!.totalValue).toBe(12 * 1000);
  });

  it("computes currentQuantity as 0 and totalValue as 0 for a product with no movements", async () => {
    const productRepo = createProductRepository(store);
    const product = await productRepo.create(BUSINESS_ID, buildInput());

    const found = await productRepo.getById(BUSINESS_ID, product.id);

    expect(found!.currentQuantity).toBe(0);
    expect(found!.totalValue).toBe(0);
  });

  it("computes isLowStock from each product's OWN movements independently (the fixed 1-3 rule), not cross-contaminated by another product's movements", async () => {
    const productRepo = createProductRepository(store);
    const movementRepo = createInventoryMovementRepository(store);
    const productA = await productRepo.create(BUSINESS_ID, buildInput({ name: "A" }));
    const productB = await productRepo.create(BUSINESS_ID, buildInput({ name: "B" }));
    await movementRepo.create(BUSINESS_ID, { productId: productA.id, type: "in", quantity: 2 }); // within 1-3 -> low
    await movementRepo.create(BUSINESS_ID, { productId: productB.id, type: "in", quantity: 8 }); // above 3 -> not low

    const foundA = await productRepo.getById(BUSINESS_ID, productA.id);
    const foundB = await productRepo.getById(BUSINESS_ID, productB.id);

    expect(foundA!.isLowStock).toBe(true);
    expect(foundB!.isLowStock).toBe(false);
  });
});

describe("createProductRepository.list", () => {
  it("returns only products scoped to businessId, sorted by name, with computed stock", async () => {
    const productRepo = createProductRepository(store);
    const movementRepo = createInventoryMovementRepository(store);
    const p1 = await productRepo.create(BUSINESS_ID, buildInput({ name: "Zeta" }));
    const p2 = await productRepo.create(BUSINESS_ID, buildInput({ name: "Alfa" }));
    await productRepo.create(OTHER_BUSINESS_ID, buildInput({ name: "De otro negocio" }));
    await movementRepo.create(BUSINESS_ID, { productId: p1.id, type: "in", quantity: 5 });
    await movementRepo.create(BUSINESS_ID, { productId: p2.id, type: "in", quantity: 2 });

    const result = await productRepo.list(BUSINESS_ID, { page: 1, pageSize: 20 });

    expect(result.total).toBe(2);
    expect(result.data.map((p) => p.name)).toEqual(["Alfa", "Zeta"]);
    expect(result.data.find((p) => p.name === "Zeta")!.currentQuantity).toBe(5);
  });
});
