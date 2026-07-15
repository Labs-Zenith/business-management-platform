import { describe, expect, it } from "vitest";
import { createCatalogRepository } from "./catalog-repo";
import { createEmptyStore, findCatalogIdByCode, type MockStore } from "./store";

/**
 * Catalogs are seeded unconditionally by `createEmptyStore` (see
 * `store.ts#seedCatalogs`'s doc comment) — so a `createEmptyStore()`-based
 * store already has every catalog populated, exactly like every other repo
 * test file in this directory relies on for `categoryId`/`methodId`/
 * `typeId`/`periodTypeId` resolution.
 */

let store: MockStore;

describe("createCatalogRepository", () => {
  it("lists all 3 invoice types, sorted by label, each with its own prefix", async () => {
    store = createEmptyStore();
    const repo = createCatalogRepository(store);

    const types = await repo.listInvoiceTypes();

    expect(types).toHaveLength(3);
    const venta = types.find((t) => t.code === "venta");
    expect(venta).toBeDefined();
    expect(venta!.prefix).toBe("FAC");
    expect(types.map((t) => t.label)).toEqual([...types.map((t) => t.label)].sort((a, b) => a.localeCompare(b)));
  });

  it("lists both expense categories (nomina/otro)", async () => {
    store = createEmptyStore();
    const repo = createCatalogRepository(store);

    const categories = await repo.listExpenseCategories();

    expect(categories.map((c) => c.code).sort()).toEqual(["nomina", "otro"]);
  });

  it("lists both payment methods (cash/transfer)", async () => {
    store = createEmptyStore();
    const repo = createCatalogRepository(store);

    const methods = await repo.listPaymentMethods();

    expect(methods.map((m) => m.code).sort()).toEqual(["cash", "transfer"]);
  });

  it("lists both movement types (in/out)", async () => {
    store = createEmptyStore();
    const repo = createCatalogRepository(store);

    const types = await repo.listMovementTypes();

    expect(types.map((t) => t.code).sort()).toEqual(["in", "out"]);
  });

  it("lists both payroll period types (quincenal/mensual)", async () => {
    store = createEmptyStore();
    const repo = createCatalogRepository(store);

    const types = await repo.listPayrollPeriodTypes();

    expect(types.map((t) => t.code).sort()).toEqual(["mensual", "quincenal"]);
  });

  it("returns ids that findCatalogIdByCode resolves consistently (same catalog, same source of truth)", async () => {
    store = createEmptyStore();
    const repo = createCatalogRepository(store);

    const categories = await repo.listExpenseCategories();
    const otro = categories.find((c) => c.code === "otro")!;

    expect(findCatalogIdByCode(store.expenseCategories, "otro")).toBe(otro.id);
  });
});
