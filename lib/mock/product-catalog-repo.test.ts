import { beforeEach, describe, expect, it } from "vitest";
import type { CatalogProductCreate, CatalogProductUpdate } from "@/lib/services/ports";
import { createProductCatalogRepository } from "./product-catalog-repo";
import { createEmptyStore, type MockStore } from "./store";

/**
 * Mirrors `lib/mock/product-repo.test.ts`'s scope (business_id scoping,
 * editable-CRUD, no delete), extended with the catalog's two child tables
 * (variants/tiers), which carry NO `businessId` of their own and scope
 * entirely through the parent product. `minOrderQuantity`'s DERIVED-not-
 * stored contract (`MIN(tiers[].quantity)`) is the one behavior unique to
 * this repo and gets its own focused coverage.
 */

const BUSINESS_ID = "10000000-0000-4000-8000-000000000001";
const OTHER_BUSINESS_ID = "10000000-0000-4000-8000-000000000099";

function fixedInput(overrides: Partial<CatalogProductCreate> = {}): CatalogProductCreate {
  return {
    name: "Servicio de diseño",
    pricingMode: "fixed",
    fixedUnitPrice: 5000000,
    ...overrides,
  };
}

function tieredInput(overrides: Partial<CatalogProductCreate> = {}): CatalogProductCreate {
  return {
    name: "Agendas personalizadas",
    category: "Papelería",
    pricingMode: "tiered",
    variants: [
      {
        name: "Tapa dura",
        tiers: [
          { quantity: 12, unitPrice: 2000000 },
          { quantity: 24, unitPrice: 1600000 },
        ],
      },
    ],
    ...overrides,
  };
}

let store: MockStore;

beforeEach(() => {
  store = createEmptyStore();
});

describe("createProductCatalogRepository.create", () => {
  it("persists a fixed-mode product with no variants", async () => {
    const repo = createProductCatalogRepository(store);

    const product = await repo.create(BUSINESS_ID, fixedInput());

    expect(product.businessId).toBe(BUSINESS_ID);
    expect(product.pricingMode).toBe("fixed");
    expect(product.fixedUnitPrice).toBe(5000000);
    expect(product.active).toBe(true);
    expect(product.variants).toEqual([]);
  });

  it("persists every variant and every tier atomically for a tiered-mode product", async () => {
    const repo = createProductCatalogRepository(store);

    const product = await repo.create(BUSINESS_ID, tieredInput());

    expect(product.variants).toHaveLength(1);
    const variant = product.variants[0]!;
    expect(variant.name).toBe("Tapa dura");
    expect(variant.tiers).toHaveLength(2);
    expect(variant.tiers.map((t) => t.quantity)).toEqual([12, 24]);
  });

  it("derives minOrderQuantity as MIN(tiers[].quantity) for a tiered variant, never stored", async () => {
    const repo = createProductCatalogRepository(store);

    const product = await repo.create(BUSINESS_ID, tieredInput());

    expect(product.variants[0]!.minOrderQuantity).toBe(12);
  });

  it("derives minOrderQuantity as null for a variant with no tiers (variant/package modes)", async () => {
    const repo = createProductCatalogRepository(store);

    const product = await repo.create(
      BUSINESS_ID,
      fixedInput({
        name: "Aviso en acrílico",
        pricingMode: "variant",
        fixedUnitPrice: undefined,
        variants: [{ name: "150x55 cm", unitPrice: 18000000 }],
      }),
    );

    expect(product.variants[0]!.minOrderQuantity).toBeNull();
    expect(product.variants[0]!.tiers).toEqual([]);
  });

  it("defaults minOrderQuantity to 1 when not supplied", async () => {
    const repo = createProductCatalogRepository(store);

    const product = await repo.create(BUSINESS_ID, fixedInput());

    expect(product.minOrderQuantity).toBe(1);
  });
});

describe("createProductCatalogRepository.getById", () => {
  it("returns null for a cross-business id (never leaked)", async () => {
    const repo = createProductCatalogRepository(store);
    const product = await repo.create(BUSINESS_ID, fixedInput());

    const result = await repo.getById(OTHER_BUSINESS_ID, product.id);

    expect(result).toBeNull();
  });

  it("returns null for a missing id", async () => {
    const repo = createProductCatalogRepository(store);

    const result = await repo.getById(BUSINESS_ID, "00000000-0000-4000-8000-000000000000");

    expect(result).toBeNull();
  });

  it("returns the full detail with variants sorted by sortOrder", async () => {
    const repo = createProductCatalogRepository(store);
    const created = await repo.create(BUSINESS_ID, tieredInput());

    const found = await repo.getById(BUSINESS_ID, created.id);

    expect(found).not.toBeNull();
    expect(found!.variants).toHaveLength(1);
  });
});

describe("createProductCatalogRepository.update", () => {
  it("returns null for a cross-business update attempt, mutating nothing", async () => {
    const repo = createProductCatalogRepository(store);
    const created = await repo.create(BUSINESS_ID, fixedInput());

    const result = await repo.update(OTHER_BUSINESS_ID, created.id, { name: "Hijacked" });

    expect(result).toBeNull();
    const unchanged = await repo.getById(BUSINESS_ID, created.id);
    expect(unchanged!.name).toBe("Servicio de diseño");
  });

  it("returns null for a missing id", async () => {
    const repo = createProductCatalogRepository(store);

    const result = await repo.update(BUSINESS_ID, "00000000-0000-4000-8000-000000000000", { name: "X" });

    expect(result).toBeNull();
  });

  it("replaces variants and tiers wholesale (delete + re-insert), never merging with the old set", async () => {
    const repo = createProductCatalogRepository(store);
    const created = await repo.create(BUSINESS_ID, tieredInput());
    const oldVariantId = created.variants[0]!.id;

    const update: CatalogProductUpdate = {
      variants: [
        {
          name: "Tapa blanda",
          tiers: [{ quantity: 50, unitPrice: 1000000 }],
        },
      ],
    };
    const updated = await repo.update(BUSINESS_ID, created.id, update);

    expect(updated!.variants).toHaveLength(1);
    expect(updated!.variants[0]!.id).not.toBe(oldVariantId);
    expect(updated!.variants[0]!.name).toBe("Tapa blanda");
    expect(updated!.variants[0]!.tiers).toHaveLength(1);
    expect(updated!.variants[0]!.tiers[0]!.quantity).toBe(50);
    // Old variant's tiers are gone too — no orphaned rows left behind.
    expect([...store.catalogPriceTiers.values()].filter((t) => t.variantId === oldVariantId)).toHaveLength(0);
  });

  it("has NO edit-lock: updates succeed regardless of any external state (unlike InvoiceRepository.update)", async () => {
    const repo = createProductCatalogRepository(store);
    const created = await repo.create(BUSINESS_ID, fixedInput());

    const updated = await repo.update(BUSINESS_ID, created.id, { active: false, fixedUnitPrice: 9999900 });

    expect(updated!.active).toBe(false);
    expect(updated!.fixedUnitPrice).toBe(9999900);
  });

  it("merges partial updates onto the existing product (fields not present in data are left untouched)", async () => {
    const repo = createProductCatalogRepository(store);
    const created = await repo.create(BUSINESS_ID, fixedInput({ category: "Servicios" }));

    const updated = await repo.update(BUSINESS_ID, created.id, { name: "Nuevo nombre" });

    expect(updated!.name).toBe("Nuevo nombre");
    expect(updated!.category).toBe("Servicios");
    expect(updated!.fixedUnitPrice).toBe(5000000);
  });
});

describe("createProductCatalogRepository.list", () => {
  it("scopes to businessId and paginates, sorted by name", async () => {
    const repo = createProductCatalogRepository(store);
    await repo.create(BUSINESS_ID, fixedInput({ name: "Zeta" }));
    await repo.create(BUSINESS_ID, fixedInput({ name: "Alfa" }));
    await repo.create(OTHER_BUSINESS_ID, fixedInput({ name: "Ajeno" }));

    const result = await repo.list(BUSINESS_ID, { page: 1, pageSize: 20 });

    expect(result.total).toBe(2);
    expect(result.data.map((p) => p.name)).toEqual(["Alfa", "Zeta"]);
  });

  it("exposes variantCount per product in the summary view", async () => {
    const repo = createProductCatalogRepository(store);
    await repo.create(BUSINESS_ID, tieredInput());

    const result = await repo.list(BUSINESS_ID, { page: 1, pageSize: 20 });

    expect(result.data[0]!.variantCount).toBe(1);
  });

  it("filters by category, pricingMode, status, and q", async () => {
    const repo = createProductCatalogRepository(store);
    await repo.create(BUSINESS_ID, fixedInput({ name: "Diseño básico", category: "Servicios" }));
    await repo.create(BUSINESS_ID, tieredInput());

    expect((await repo.list(BUSINESS_ID, { category: "Papelería", page: 1, pageSize: 20 })).total).toBe(1);
    expect((await repo.list(BUSINESS_ID, { pricingMode: "tiered", page: 1, pageSize: 20 })).total).toBe(1);
    expect((await repo.list(BUSINESS_ID, { q: "diseño", page: 1, pageSize: 20 })).total).toBe(1);

    await repo.update(BUSINESS_ID, (await repo.list(BUSINESS_ID, { q: "diseño", page: 1, pageSize: 20 })).data[0]!.id, {
      active: false,
    });
    expect((await repo.list(BUSINESS_ID, { status: "inactive", page: 1, pageSize: 20 })).total).toBe(1);
    expect((await repo.list(BUSINESS_ID, { status: "active", page: 1, pageSize: 20 })).total).toBe(1);
  });

  it("sorts by category, sending nameless (null category) rows last regardless of direction", async () => {
    const repo = createProductCatalogRepository(store);
    await repo.create(BUSINESS_ID, fixedInput({ name: "B", category: "Zeta" }));
    await repo.create(BUSINESS_ID, fixedInput({ name: "C", category: null }));
    await repo.create(BUSINESS_ID, fixedInput({ name: "A", category: "Alfa" }));

    const asc = await repo.list(BUSINESS_ID, { sortBy: "category", sortDir: "asc", page: 1, pageSize: 20 });
    expect(asc.data.map((p) => p.name)).toEqual(["A", "B", "C"]);

    const desc = await repo.list(BUSINESS_ID, { sortBy: "category", sortDir: "desc", page: 1, pageSize: 20 });
    expect(desc.data.map((p) => p.name)).toEqual(["B", "A", "C"]);
  });

  it("sorts by price using the lowest price per pricing mode: fixed/area read directly, variant/package take the cheapest row", async () => {
    const repo = createProductCatalogRepository(store);
    await repo.create(BUSINESS_ID, fixedInput({ name: "Fijo", fixedUnitPrice: 50000 }));
    await repo.create(BUSINESS_ID, {
      name: "Variante",
      pricingMode: "variant",
      variants: [
        { name: "Chico", unitPrice: 70000 },
        { name: "Grande", unitPrice: 30000 },
      ],
    });
    await repo.create(BUSINESS_ID, {
      name: "Paquete",
      pricingMode: "package",
      variants: [{ name: "Caja x10", packageQuantity: 10, packageTotalPrice: 90000 }],
    });
    await repo.create(BUSINESS_ID, {
      name: "Área",
      pricingMode: "area",
      areaBasePrice: 40000,
      areaRatePerM2: 5000,
    });

    const result = await repo.list(BUSINESS_ID, { sortBy: "price", sortDir: "asc", page: 1, pageSize: 20 });

    // Variante (30000) < Área (40000) < Fijo (50000) < Paquete (90000).
    expect(result.data.map((p) => p.name)).toEqual(["Variante", "Área", "Fijo", "Paquete"]);
    // The internal sort-only field never leaks onto the returned summary.
    expect(result.data[0]).not.toHaveProperty("lowestPriceCents");
  });

  it("sorts a 'tiered' product's price by the cheapest rung across every variant's ladder", async () => {
    const repo = createProductCatalogRepository(store);
    await repo.create(BUSINESS_ID, {
      name: "Barato",
      pricingMode: "tiered",
      variants: [{ name: "Única", tiers: [{ quantity: 24, unitPrice: 100 }] }],
    });
    await repo.create(BUSINESS_ID, {
      name: "Caro",
      pricingMode: "tiered",
      variants: [{ name: "Única", tiers: [{ quantity: 12, unitPrice: 900 }] }],
    });

    const result = await repo.list(BUSINESS_ID, { sortBy: "price", sortDir: "asc", page: 1, pageSize: 20 });

    expect(result.data.map((p) => p.name)).toEqual(["Barato", "Caro"]);
  });

  it("sorts a priceless product (no priced variant yet) last, in EITHER direction", async () => {
    const repo = createProductCatalogRepository(store);
    await repo.create(BUSINESS_ID, fixedInput({ name: "Con precio", fixedUnitPrice: 1000 }));
    await repo.create(BUSINESS_ID, { name: "Sin variantes aún", pricingMode: "variant", variants: [] });

    const asc = await repo.list(BUSINESS_ID, { sortBy: "price", sortDir: "asc", page: 1, pageSize: 20 });
    expect(asc.data.map((p) => p.name)).toEqual(["Con precio", "Sin variantes aún"]);

    const desc = await repo.list(BUSINESS_ID, { sortBy: "price", sortDir: "desc", page: 1, pageSize: 20 });
    expect(desc.data.map((p) => p.name)).toEqual(["Con precio", "Sin variantes aún"]);
  });
});

/**
 * A catalog product with no billing history is hard-deletable — mirrors
 * `lib/mock/product-repo.test.ts#delete`'s coverage. Once it has been
 * invoiced (via `catalogProductId`, NOT `productId`) the delete is REFUSED,
 * so the invoice can always be traced back to what was sold; the caller then
 * offers deactivation instead. UNLIKE inventory's product, deleting also
 * simulates the real backend's `ON DELETE CASCADE` by removing the child
 * variants/tiers by hand (the mock store has no real FK to lean on).
 */
describe("createProductCatalogRepository.delete", () => {
  function seedInvoiceItem(itemId: string, invoiceId: string, catalogProductId: string | null) {
    store.invoiceItems.set(itemId, {
      id: itemId,
      invoiceId,
      description: "Agendas personalizadas",
      quantity: 2,
      unitPrice: 2000000,
      lineTotal: 4000000,
      productId: null,
      catalogProductId,
    });
  }

  it("removes a never-invoiced product", async () => {
    const repo = createProductCatalogRepository(store);
    const created = await repo.create(BUSINESS_ID, fixedInput());

    await expect(repo.delete(BUSINESS_ID, created.id)).resolves.toEqual({ outcome: "deleted" });

    expect(store.catalogProducts.has(created.id)).toBe(false);
  });

  it("removes the product's variants and tiers alongside it, leaving other products' untouched (simulating ON DELETE CASCADE)", async () => {
    const repo = createProductCatalogRepository(store);
    const doomed = await repo.create(BUSINESS_ID, tieredInput());
    const survivor = await repo.create(BUSINESS_ID, tieredInput({ name: "Otro" }));

    await repo.delete(BUSINESS_ID, doomed.id);

    expect([...store.catalogProductVariants.values()].some((v) => v.productId === doomed.id)).toBe(false);
    expect([...store.catalogPriceTiers.values()].some((t) => t.variantId === doomed.variants[0]!.id)).toBe(false);
    const survivorVariants = [...store.catalogProductVariants.values()].filter((v) => v.productId === survivor.id);
    expect(survivorVariants).toHaveLength(1);
  });

  it("refuses with the DISTINCT invoice count once the product has been sold", async () => {
    const repo = createProductCatalogRepository(store);
    const created = await repo.create(BUSINESS_ID, fixedInput());
    seedInvoiceItem("item-1", "invoice-1", created.id);
    seedInvoiceItem("item-2", "invoice-2", created.id);

    await expect(repo.delete(BUSINESS_ID, created.id)).resolves.toEqual({
      outcome: "conflict",
      invoiceCount: 2,
    });

    // Nothing is destroyed: neither the product nor its billing history.
    expect(store.catalogProducts.has(created.id)).toBe(true);
    expect(store.invoiceItems.size).toBe(2);
    expect(store.invoiceItems.get("item-1")!.catalogProductId).toBe(created.id);
  });

  it("counts invoices, not lines, when one invoice sells the product twice", async () => {
    const repo = createProductCatalogRepository(store);
    const created = await repo.create(BUSINESS_ID, fixedInput());
    seedInvoiceItem("item-1", "invoice-1", created.id);
    seedInvoiceItem("item-2", "invoice-1", created.id);

    await expect(repo.delete(BUSINESS_ID, created.id)).resolves.toEqual({
      outcome: "conflict",
      invoiceCount: 1,
    });
  });

  it("ignores a line referencing this product's id via the INVENTORY productId field, not catalogProductId", async () => {
    const repo = createProductCatalogRepository(store);
    const created = await repo.create(BUSINESS_ID, fixedInput());
    store.invoiceItems.set("item-inventory", {
      id: "item-inventory",
      invoiceId: "invoice-inventory",
      description: "Coincidencia de id, no de catálogo",
      quantity: 1,
      unitPrice: 1000,
      lineTotal: 1000,
      productId: created.id,
      catalogProductId: null,
    });

    await expect(repo.delete(BUSINESS_ID, created.id)).resolves.toEqual({ outcome: "deleted" });
  });

  it("ignores another product's invoice lines when deciding", async () => {
    const repo = createProductCatalogRepository(store);
    const created = await repo.create(BUSINESS_ID, fixedInput());
    seedInvoiceItem("item-other", "invoice-3", "another-product-id");

    await expect(repo.delete(BUSINESS_ID, created.id)).resolves.toEqual({ outcome: "deleted" });
  });

  it("returns not_found for a cross-business id, leaving the product untouched", async () => {
    const repo = createProductCatalogRepository(store);
    const created = await repo.create(BUSINESS_ID, fixedInput());

    await expect(repo.delete(OTHER_BUSINESS_ID, created.id)).resolves.toEqual({ outcome: "not_found" });

    expect(store.catalogProducts.has(created.id)).toBe(true);
  });

  it("returns not_found for an unknown id", async () => {
    const repo = createProductCatalogRepository(store);

    await expect(repo.delete(BUSINESS_ID, "80000000-0000-4000-8000-00000000dead")).resolves.toEqual({
      outcome: "not_found",
    });
  });
});

describe("createProductCatalogRepository.listCategories", () => {
  it("returns distinct, sorted, non-null categories for the business only", async () => {
    const repo = createProductCatalogRepository(store);
    await repo.create(BUSINESS_ID, fixedInput({ category: "Servicios" }));
    await repo.create(BUSINESS_ID, tieredInput({ category: "Papelería" }));
    await repo.create(BUSINESS_ID, fixedInput({ name: "Otro servicio", category: "Servicios" }));
    await repo.create(BUSINESS_ID, fixedInput({ name: "Sin categoría", category: null }));
    await repo.create(OTHER_BUSINESS_ID, fixedInput({ name: "Ajeno", category: "Ajena" }));

    const categories = await repo.listCategories(BUSINESS_ID);

    expect(categories).toEqual(["Papelería", "Servicios"]);
  });
});
