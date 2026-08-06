import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Mirrors `lib/db/product-repo.test.ts`'s mocking pattern (`sql` as a
 * `vi.fn()` tagged-template mock) for `list`/`getById`/`listCategories`, and
 * `lib/db/invoice-repo.test.ts`'s `runTransaction`/`tx` mock for `create`/
 * `update`'s atomic header+variants+tiers writes.
 */
const { mockSql, mockTx, mockRunTransaction } = vi.hoisted(() => {
  const sqlFn = vi.fn();
  const txFn = vi.fn();
  const runTransactionFn = vi.fn();
  return { mockSql: sqlFn, mockTx: txFn, mockRunTransaction: runTransactionFn };
});

vi.mock("./client", () => ({
  sql: mockSql,
  isDbConfigured: true,
  runTransaction: mockRunTransaction,
}));

const { productCatalogRepo } = await import("./product-catalog-repo");

const BUSINESS_ID = "10000000-0000-4000-8000-000000000001";
const OTHER_BUSINESS_ID = "10000000-0000-4000-8000-000000000099";
const PRODUCT_ID = "b0000000-0000-4000-8000-000000000001";
const VARIANT_ID = "b0000000-0000-4000-8000-000000000002";
const TIER_ID = "b0000000-0000-4000-8000-000000000003";

function productRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: PRODUCT_ID,
    business_id: BUSINESS_ID,
    name: "Agendas personalizadas",
    category: "Papelería",
    description: null,
    pricing_mode: "tiered",
    min_order_quantity: 1,
    fixed_unit_price: null,
    area_base_price: null,
    area_rate_per_m2: null,
    area_min_price: null,
    active: true,
    created_at: "2026-07-01T00:00:00.000Z",
    updated_at: "2026-07-01T00:00:00.000Z",
    ...overrides,
  };
}

function variantRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: VARIANT_ID,
    product_id: PRODUCT_ID,
    name: "Tapa dura",
    description: null,
    sort_order: 0,
    unit_price: null,
    package_quantity: null,
    package_total_price: null,
    active: true,
    ...overrides,
  };
}

function tierRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: TIER_ID,
    variant_id: VARIANT_ID,
    quantity: 12,
    unit_price: 2000000,
    flat_total_price: null,
    sort_order: 0,
    ...overrides,
  };
}

describe("db productCatalogRepo.getById", () => {
  beforeEach(() => {
    mockSql.mockReset();
  });

  it("builds the full detail with variants and their tiers, deriving minOrderQuantity", async () => {
    mockSql.mockResolvedValueOnce([productRow()]).mockResolvedValueOnce([variantRow()]).mockResolvedValueOnce([
      tierRow({ quantity: 12 }),
      tierRow({ id: "b0000000-0000-4000-8000-000000000004", quantity: 24, unit_price: 1600000, sort_order: 1 }),
    ]);

    const product = await productCatalogRepo.getById(BUSINESS_ID, PRODUCT_ID);

    expect(product).not.toBeNull();
    expect(product!.variants).toHaveLength(1);
    expect(product!.variants[0]!.tiers).toHaveLength(2);
    expect(product!.variants[0]!.minOrderQuantity).toBe(12);
  });

  it("returns null (not leaked) when the row belongs to a different business", async () => {
    mockSql.mockResolvedValueOnce([productRow({ business_id: OTHER_BUSINESS_ID })]);

    const product = await productCatalogRepo.getById(BUSINESS_ID, PRODUCT_ID);

    expect(product).toBeNull();
  });

  it("returns null when no row is found", async () => {
    mockSql.mockResolvedValueOnce([]);

    const product = await productCatalogRepo.getById(BUSINESS_ID, "00000000-0000-4000-8000-000000000000");

    expect(product).toBeNull();
  });
});

describe("db productCatalogRepo.list", () => {
  beforeEach(() => {
    mockSql.mockReset();
  });

  it("scopes every fetch to businessId and computes variantCount per product", async () => {
    mockSql
      .mockResolvedValueOnce([productRow({ name: "Zeta" }), productRow({ id: "b0000000-0000-4000-8000-000000000005", name: "Alfa" })])
      .mockResolvedValueOnce([{ id: VARIANT_ID, product_id: PRODUCT_ID }])
      .mockResolvedValueOnce([]);

    const result = await productCatalogRepo.list(BUSINESS_ID, { page: 1, pageSize: 20 });

    expect(result.total).toBe(2);
    expect(result.data.map((p) => p.name)).toEqual(["Alfa", "Zeta"]);
    const zeta = result.data.find((p) => p.name === "Zeta")!;
    expect(zeta.variantCount).toBe(1);
    const alfa = result.data.find((p) => p.name === "Alfa")!;
    expect(alfa.variantCount).toBe(0);

    const [, ...productsValues] = mockSql.mock.calls[0]!;
    expect(productsValues).toEqual([BUSINESS_ID]);
    // Neither internal helper field leaks onto the returned summary.
    expect(zeta).not.toHaveProperty("lowestPriceCents");
  });

  it("filters by category, pricingMode, status, and q", async () => {
    mockSql
      .mockResolvedValueOnce([productRow({ name: "A", category: "Papelería", pricing_mode: "tiered", active: true })])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const result = await productCatalogRepo.list(BUSINESS_ID, {
      category: "Papelería",
      pricingMode: "tiered",
      status: "active",
      q: "a",
      page: 1,
      pageSize: 20,
    });

    expect(result.total).toBe(1);
  });

  it("defaults to name ascending — the pre-existing fixed order — when no sort is given", async () => {
    mockSql
      .mockResolvedValueOnce([productRow({ name: "Zeta" }), productRow({ id: "b0000000-0000-4000-8000-000000000005", name: "Alfa" })])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const result = await productCatalogRepo.list(BUSINESS_ID, { page: 1, pageSize: 20 });

    expect(result.data.map((p) => p.name)).toEqual(["Alfa", "Zeta"]);
  });

  it("sorts by category, sending nameless (null category) rows last regardless of direction", async () => {
    mockSql
      .mockResolvedValueOnce([
        productRow({ id: "b0000000-0000-4000-8000-000000000005", name: "B", category: "Zeta" }),
        productRow({ id: "b0000000-0000-4000-8000-000000000006", name: "C", category: null }),
        productRow({ id: "b0000000-0000-4000-8000-000000000007", name: "A", category: "Alfa" }),
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const asc = await productCatalogRepo.list(BUSINESS_ID, { sortBy: "category", sortDir: "asc", page: 1, pageSize: 20 });
    expect(asc.data.map((p) => p.name)).toEqual(["A", "B", "C"]);

    mockSql
      .mockResolvedValueOnce([
        productRow({ id: "b0000000-0000-4000-8000-000000000005", name: "B", category: "Zeta" }),
        productRow({ id: "b0000000-0000-4000-8000-000000000006", name: "C", category: null }),
        productRow({ id: "b0000000-0000-4000-8000-000000000007", name: "A", category: "Alfa" }),
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const desc = await productCatalogRepo.list(BUSINESS_ID, { sortBy: "category", sortDir: "desc", page: 1, pageSize: 20 });
    expect(desc.data.map((p) => p.name)).toEqual(["B", "A", "C"]);
  });

  it("sorts by price using the lowest price per pricing mode: fixed/area read directly, variant/package take the cheapest row", async () => {
    const FIXED_ID = "b0000000-0000-4000-8000-000000000020";
    const VARIANT_PRODUCT_ID = "b0000000-0000-4000-8000-000000000021";
    const PACKAGE_PRODUCT_ID = "b0000000-0000-4000-8000-000000000022";

    mockSql
      .mockResolvedValueOnce([
        productRow({ id: FIXED_ID, name: "Fijo", pricing_mode: "fixed", fixed_unit_price: 50000 }),
        productRow({ id: VARIANT_PRODUCT_ID, name: "Variante", pricing_mode: "variant", fixed_unit_price: null }),
        productRow({ id: PACKAGE_PRODUCT_ID, name: "Paquete", pricing_mode: "package", fixed_unit_price: null }),
      ])
      .mockResolvedValueOnce([
        variantRow({ id: "b0000000-0000-4000-8000-000000000023", product_id: VARIANT_PRODUCT_ID, unit_price: 70000 }),
        variantRow({ id: "b0000000-0000-4000-8000-000000000024", product_id: VARIANT_PRODUCT_ID, unit_price: 30000 }),
        variantRow({
          id: "b0000000-0000-4000-8000-000000000025",
          product_id: PACKAGE_PRODUCT_ID,
          unit_price: null,
          package_total_price: 90000,
        }),
      ])
      .mockResolvedValueOnce([]);

    const result = await productCatalogRepo.list(BUSINESS_ID, { sortBy: "price", sortDir: "asc", page: 1, pageSize: 20 });

    // Variante's cheapest variant (30000) < Fijo (50000) < Paquete (90000).
    expect(result.data.map((p) => p.name)).toEqual(["Variante", "Fijo", "Paquete"]);
  });

  it("sorts a 'tiered' product's price by the cheapest rung across every variant's ladder", async () => {
    const CHEAP_ID = "b0000000-0000-4000-8000-000000000030";
    const CHEAP_VARIANT_ID = "b0000000-0000-4000-8000-000000000031";
    const PRICEY_ID = "b0000000-0000-4000-8000-000000000032";
    const PRICEY_VARIANT_ID = "b0000000-0000-4000-8000-000000000033";

    mockSql
      .mockResolvedValueOnce([
        productRow({ id: CHEAP_ID, name: "Barato", pricing_mode: "tiered" }),
        productRow({ id: PRICEY_ID, name: "Caro", pricing_mode: "tiered" }),
      ])
      .mockResolvedValueOnce([
        variantRow({ id: CHEAP_VARIANT_ID, product_id: CHEAP_ID }),
        variantRow({ id: PRICEY_VARIANT_ID, product_id: PRICEY_ID }),
      ])
      .mockResolvedValueOnce([
        tierRow({ id: "b0000000-0000-4000-8000-000000000034", variant_id: CHEAP_VARIANT_ID, quantity: 24, unit_price: 100 }),
        tierRow({ id: "b0000000-0000-4000-8000-000000000035", variant_id: PRICEY_VARIANT_ID, quantity: 12, unit_price: 900 }),
      ]);

    const result = await productCatalogRepo.list(BUSINESS_ID, { sortBy: "price", sortDir: "asc", page: 1, pageSize: 20 });

    expect(result.data.map((p) => p.name)).toEqual(["Barato", "Caro"]);
  });

  it("sorts a priceless product (no priced variant yet) last, in EITHER direction", async () => {
    const PRICED_ID = "b0000000-0000-4000-8000-000000000040";
    const EMPTY_ID = "b0000000-0000-4000-8000-000000000041";

    mockSql
      .mockResolvedValueOnce([
        productRow({ id: PRICED_ID, name: "Con precio", pricing_mode: "fixed", fixed_unit_price: 1000 }),
        productRow({ id: EMPTY_ID, name: "Sin variantes aún", pricing_mode: "variant", fixed_unit_price: null }),
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const asc = await productCatalogRepo.list(BUSINESS_ID, { sortBy: "price", sortDir: "asc", page: 1, pageSize: 20 });
    expect(asc.data.map((p) => p.name)).toEqual(["Con precio", "Sin variantes aún"]);

    mockSql
      .mockResolvedValueOnce([
        productRow({ id: PRICED_ID, name: "Con precio", pricing_mode: "fixed", fixed_unit_price: 1000 }),
        productRow({ id: EMPTY_ID, name: "Sin variantes aún", pricing_mode: "variant", fixed_unit_price: null }),
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const desc = await productCatalogRepo.list(BUSINESS_ID, { sortBy: "price", sortDir: "desc", page: 1, pageSize: 20 });
    expect(desc.data.map((p) => p.name)).toEqual(["Con precio", "Sin variantes aún"]);
  });
});

describe("db productCatalogRepo.create", () => {
  beforeEach(() => {
    mockSql.mockReset();
    mockTx.mockReset();
    mockRunTransaction.mockReset();
    mockRunTransaction.mockImplementation((fn: (tx: typeof mockTx) => Promise<unknown>) => fn(mockTx));
  });

  it("inserts the header, then every variant, then every tier, all inside ONE transaction", async () => {
    mockTx
      .mockResolvedValueOnce([productRow()]) // header insert
      .mockResolvedValueOnce([variantRow()]) // variant insert
      .mockResolvedValueOnce([tierRow({ quantity: 12 })]) // tier insert 1
      .mockResolvedValueOnce([tierRow({ id: "b0000000-0000-4000-8000-000000000004", quantity: 24, unit_price: 1600000, sort_order: 1 })]); // tier insert 2

    const detail = await productCatalogRepo.create(BUSINESS_ID, {
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
    });

    expect(mockRunTransaction).toHaveBeenCalledTimes(1);
    expect(mockTx).toHaveBeenCalledTimes(4);
    expect(detail.variants).toHaveLength(1);
    expect(detail.variants[0]!.tiers).toHaveLength(2);
    expect(detail.variants[0]!.minOrderQuantity).toBe(12);

    const headerText = Array.from(mockTx.mock.calls[0]![0] as unknown as string[]).join("");
    expect(headerText).toContain("INSERT INTO catalog_products");
    const variantText = Array.from(mockTx.mock.calls[1]![0] as unknown as string[]).join("");
    expect(variantText).toContain("INSERT INTO catalog_product_variants");
    const tierText = Array.from(mockTx.mock.calls[2]![0] as unknown as string[]).join("");
    expect(tierText).toContain("INSERT INTO catalog_price_tiers");
  });

  it("persists a fixed-mode product with zero variants (only the header statement runs)", async () => {
    mockTx.mockResolvedValueOnce([productRow({ pricing_mode: "fixed", fixed_unit_price: 5000000, category: null })]);

    const detail = await productCatalogRepo.create(BUSINESS_ID, {
      name: "Servicio de diseño",
      pricingMode: "fixed",
      fixedUnitPrice: 5000000,
    });

    expect(mockTx).toHaveBeenCalledTimes(1);
    expect(detail.variants).toEqual([]);
  });

  it("aborts the whole transaction when a variant insert rejects", async () => {
    mockTx.mockResolvedValueOnce([productRow()]).mockRejectedValueOnce(new Error("simulated variant insert failure"));

    await expect(
      productCatalogRepo.create(BUSINESS_ID, {
        name: "Agendas personalizadas",
        pricingMode: "tiered",
        variants: [{ name: "Tapa dura", tiers: [{ quantity: 12, unitPrice: 2000000 }] }],
      }),
    ).rejects.toThrow("simulated variant insert failure");

    expect(mockSql).not.toHaveBeenCalled();
  });
});

describe("db productCatalogRepo.update", () => {
  beforeEach(() => {
    mockSql.mockReset();
    mockTx.mockReset();
    mockRunTransaction.mockReset();
    mockRunTransaction.mockImplementation((fn: (tx: typeof mockTx) => Promise<unknown>) => fn(mockTx));
  });

  it("returns null (never leaked) for a cross-business update attempt, without opening a transaction", async () => {
    mockSql.mockResolvedValueOnce([productRow({ business_id: OTHER_BUSINESS_ID })]);

    const result = await productCatalogRepo.update(BUSINESS_ID, PRODUCT_ID, { name: "Hijacked" });

    expect(result).toBeNull();
    expect(mockRunTransaction).not.toHaveBeenCalled();
  });

  it("returns null for a missing id", async () => {
    mockSql.mockResolvedValueOnce([]);

    const result = await productCatalogRepo.update(BUSINESS_ID, "00000000-0000-4000-8000-000000000000", { name: "X" });

    expect(result).toBeNull();
    expect(mockRunTransaction).not.toHaveBeenCalled();
  });

  it("replaces variants wholesale: header UPDATE, then DELETE catalog_product_variants (cascades tiers), then re-insert, all in ONE transaction — NO edit-lock guard", async () => {
    mockSql.mockResolvedValueOnce([productRow()]);
    mockTx
      .mockResolvedValueOnce([productRow({ name: "Agendas VIP" })]) // header update
      .mockResolvedValueOnce([]) // delete variants (cascades tiers)
      .mockResolvedValueOnce([variantRow({ name: "Tapa blanda" })]) // new variant insert
      .mockResolvedValueOnce([tierRow({ quantity: 50, unit_price: 1000000 })]); // new tier insert

    const updated = await productCatalogRepo.update(BUSINESS_ID, PRODUCT_ID, {
      name: "Agendas VIP",
      variants: [{ name: "Tapa blanda", tiers: [{ quantity: 50, unitPrice: 1000000 }] }],
    });

    expect(updated!.name).toBe("Agendas VIP");
    expect(updated!.variants[0]!.name).toBe("Tapa blanda");
    expect(mockTx).toHaveBeenCalledTimes(4);

    const headerText = Array.from(mockTx.mock.calls[0]![0] as unknown as string[]).join("");
    expect(headerText).toContain("UPDATE catalog_products SET");
    expect(headerText).not.toContain("FOR UPDATE"); // no edit-lock, unlike invoices
    const deleteText = Array.from(mockTx.mock.calls[1]![0] as unknown as string[]).join("");
    expect(deleteText).toContain("DELETE FROM catalog_product_variants");
  });
});

describe("db productCatalogRepo.listCategories", () => {
  beforeEach(() => {
    mockSql.mockReset();
  });

  it("selects distinct non-null categories scoped to businessId", async () => {
    mockSql.mockResolvedValueOnce([{ category: "Avisos" }, { category: "Papelería" }]);

    const categories = await productCatalogRepo.listCategories(BUSINESS_ID);

    expect(categories).toEqual(["Avisos", "Papelería"]);
    const [text, ...values] = mockSql.mock.calls[0]!;
    expect(Array.from(text as unknown as string[]).join("")).toContain("DISTINCT category");
    expect(values).toEqual([BUSINESS_ID]);
  });
});
