import type postgres from "postgres";
import type {
  CatalogPriceTier,
  CatalogProduct,
  CatalogProductCreate,
  CatalogProductDetail,
  CatalogProductListQuery,
  CatalogProductRepository,
  CatalogProductSortBy,
  CatalogProductSummary,
  CatalogProductUpdate,
  CatalogProductVariant,
  CatalogProductVariantWithTiers,
  CatalogVariantCreate,
  Paged,
} from "@/lib/services/ports";
import { CATALOG_PRODUCT_SORT_KEYS } from "@/lib/services/ports";
import { createSorter, numberKey, textKey } from "@/lib/services/sorting";
import { runTransaction, sql } from "./client";

/**
 * Mirrors `product-repo.ts`'s strategy: fetch business-scoped rows via
 * simple parameterized queries, filter/sort/paginate in JS. `list` only
 * needs a `variantCount` per product (no full variant/tier payload), so it
 * fetches every variant row for the business's products ONCE and groups them
 * in JS — mirroring `product-repo.ts#list`'s single business-wide movements
 * fetch. `getById` fetches the single product's variants and their tiers
 * directly, since both are already scoped by the one product id.
 *
 * `create`/`update` are atomic in ONE `runTransaction` — header + every
 * variant + every tier — per `CatalogProductRepository`'s doc comment. NO
 * `FOR UPDATE`/lock is used anywhere in this file: unlike invoice/quote
 * numbering, there is no shared sequence to serialize, and unlike
 * `invoice-repo.ts#update`'s edit-lock, a catalog listing has no
 * "already paid" state to protect (see `CatalogProductRepository.update`'s
 * doc comment — "NO edit-lock").
 */

type CatalogProductRow = {
  id: string;
  business_id: string;
  name: string;
  category: string | null;
  description: string | null;
  pricing_mode: string;
  min_order_quantity: number;
  fixed_unit_price: number | null;
  area_base_price: number | null;
  area_rate_per_m2: number | null;
  area_min_price: number | null;
  active: boolean;
  created_at: string;
  updated_at: string;
};

type CatalogProductVariantRow = {
  id: string;
  product_id: string;
  name: string;
  description: string | null;
  sort_order: number;
  unit_price: number | null;
  package_quantity: number | null;
  package_total_price: number | null;
  active: boolean;
};

type CatalogPriceTierRow = {
  id: string;
  variant_id: string;
  quantity: number;
  unit_price: number | null;
  flat_total_price: number | null;
  sort_order: number;
};

function toProduct(row: CatalogProductRow): CatalogProduct {
  return {
    id: row.id,
    businessId: row.business_id,
    name: row.name,
    category: row.category,
    description: row.description,
    pricingMode: row.pricing_mode as CatalogProduct["pricingMode"],
    minOrderQuantity: Number(row.min_order_quantity),
    fixedUnitPrice: row.fixed_unit_price === null ? null : Number(row.fixed_unit_price),
    areaBasePrice: row.area_base_price === null ? null : Number(row.area_base_price),
    areaRatePerM2: row.area_rate_per_m2 === null ? null : Number(row.area_rate_per_m2),
    areaMinPrice: row.area_min_price === null ? null : Number(row.area_min_price),
    active: row.active,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

function toVariant(row: CatalogProductVariantRow): CatalogProductVariant {
  return {
    id: row.id,
    productId: row.product_id,
    name: row.name,
    description: row.description,
    sortOrder: Number(row.sort_order),
    unitPrice: row.unit_price === null ? null : Number(row.unit_price),
    packageQuantity: row.package_quantity === null ? null : Number(row.package_quantity),
    packageTotalPrice: row.package_total_price === null ? null : Number(row.package_total_price),
    active: row.active,
  };
}

function toTier(row: CatalogPriceTierRow): CatalogPriceTier {
  return {
    id: row.id,
    variantId: row.variant_id,
    quantity: Number(row.quantity),
    unitPrice: row.unit_price === null ? null : Number(row.unit_price),
    flatTotalPrice: row.flat_total_price === null ? null : Number(row.flat_total_price),
    sortOrder: Number(row.sort_order),
  };
}

/** `minOrderQuantity` is DERIVED at read time as `MIN(tiers[].quantity)`, never stored — see `CatalogProductVariantWithTiers`'s doc comment. */
function deriveMinOrderQuantity(tiers: CatalogPriceTier[]): number | null {
  if (tiers.length === 0) return null;
  return Math.min(...tiers.map((tier) => tier.quantity));
}

function toVariantWithTiers(variant: CatalogProductVariant, tiers: CatalogPriceTier[]): CatalogProductVariantWithTiers {
  const ownTiers = tiers.filter((tier) => tier.variantId === variant.id);
  return { ...variant, tiers: ownTiers, minOrderQuantity: deriveMinOrderQuantity(ownTiers) };
}

function paginate<T>(items: T[], page: number, pageSize: number): Paged<T> {
  const start = (page - 1) * pageSize;
  return { data: items.slice(start, start + pageSize), page, pageSize, total: items.length };
}

type ListVariantRow = Pick<CatalogProductVariantRow, "id" | "product_id" | "unit_price" | "package_quantity" | "package_total_price">;
type ListTierRow = Pick<CatalogPriceTierRow, "id" | "variant_id" | "unit_price" | "flat_total_price">;

/**
 * The lowest price a customer could pay for `product`, used ONLY to order the
 * "Precio" column (never displayed as-is — the list page still renders
 * `PriceCell`'s per-mode presentation). Mirrors
 * `app/(dashboard)/catalogo/[id]/page.tsx#priceRangeLabel`'s per-mode
 * branches, taking the MIN branch of each: `fixed`/`area` read straight off
 * the header row, `variant`/`package` take the cheapest variant, `tiered`
 * takes the cheapest rung across every variant's ladder (a rung's
 * `flatTotalPrice` is compared as-is, NOT divided by quantity — same
 * "whichever number `priceRangeLabel` shows" contract). `null` when the mode
 * has no priced variant/tier yet (an incomplete catalog entry), which
 * `numberKey` sorts last regardless of direction.
 */
function lowestPriceCents(product: CatalogProduct, variants: ListVariantRow[], tiers: ListTierRow[]): number | null {
  switch (product.pricingMode) {
    case "fixed":
      return product.fixedUnitPrice;
    case "area":
      return product.areaBasePrice;
    case "variant": {
      const prices = variants
        .filter((row) => String(row.product_id) === String(product.id))
        .map((row) => row.unit_price)
        .filter((price): price is number => price !== null)
        .map(Number);
      return prices.length > 0 ? Math.min(...prices) : null;
    }
    case "package": {
      const prices = variants
        .filter((row) => String(row.product_id) === String(product.id))
        .map((row) => row.package_total_price)
        .filter((price): price is number => price !== null)
        .map(Number);
      return prices.length > 0 ? Math.min(...prices) : null;
    }
    case "tiered": {
      const variantIds = new Set(
        variants.filter((row) => String(row.product_id) === String(product.id)).map((row) => String(row.id)),
      );
      const prices = tiers
        .filter((row) => variantIds.has(String(row.variant_id)))
        .map((row) => row.unit_price ?? row.flat_total_price)
        .filter((price): price is number => price !== null)
        .map(Number);
      return prices.length > 0 ? Math.min(...prices) : null;
    }
  }
}

type SortableCatalogSummary = CatalogProductSummary & { lowestPriceCents: number | null };

/**
 * Built with the SAME `createSorter`/`textKey`/`numberKey` machinery every
 * other entity sorter uses (`lib/services/sorting.ts`), but NOT registered
 * there: this repo was ported into a fileset owned exclusively by this
 * change, while `sorting.ts` was being edited concurrently elsewhere.
 * Behaviourally there is no difference from e.g. `productSorter` — a future
 * consolidation pass can hoist this into `sorting.ts` as
 * `catalogProductSorter` with zero logic changes. Duplicated verbatim in
 * `lib/mock/product-catalog-repo.ts` so the two backends cannot diverge.
 */
const catalogProductSorter = createSorter<SortableCatalogSummary, CatalogProductSortBy>({
  keys: CATALOG_PRODUCT_SORT_KEYS,
  // Reproduces the pre-existing fixed order: `products.sort((a, b) => a.name.localeCompare(b.name))`.
  defaultSort: { sortBy: "name", sortDir: "asc" },
  tieBreak: (product) => product.id,
  accessors: {
    name: (product) => textKey(product.name),
    category: (product) => textKey(product.category),
    price: (product) => numberKey(product.lowestPriceCents),
  },
});

/**
 * Inserts every variant (and its tiers) of `variants` under `productId`,
 * sequential awaits against the SAME `tx` — shared by `create` and `update`.
 * `sortOrder` defaults to array position when the caller doesn't supply one
 * (`CatalogPriceTierCreate` never carries a `sortOrder` at all — the ladder's
 * own array order IS the tier order).
 */
async function insertVariantsAndTiers(
  tx: postgres.TransactionSql,
  productId: string,
  variants: CatalogVariantCreate[] | undefined,
): Promise<{ variantRows: CatalogProductVariantRow[]; tierRows: CatalogPriceTierRow[] }> {
  const variantRows: CatalogProductVariantRow[] = [];
  const tierRows: CatalogPriceTierRow[] = [];

  let variantIndex = 0;
  for (const variantInput of variants ?? []) {
    const insertedVariantRows = (await tx`
      INSERT INTO catalog_product_variants (id, product_id, name, description, sort_order, unit_price, package_quantity, package_total_price, active)
      VALUES (gen_random_uuid(), ${productId}, ${variantInput.name}, ${variantInput.description ?? null}, ${variantInput.sortOrder ?? variantIndex}, ${variantInput.unitPrice ?? null}, ${variantInput.packageQuantity ?? null}, ${variantInput.packageTotalPrice ?? null}, true)
      RETURNING *
    `) as unknown as CatalogProductVariantRow[];
    const variantRow = insertedVariantRows[0]!;
    variantRows.push(variantRow);

    let tierIndex = 0;
    for (const tierInput of variantInput.tiers ?? []) {
      const insertedTierRows = (await tx`
        INSERT INTO catalog_price_tiers (id, variant_id, quantity, unit_price, flat_total_price, sort_order)
        VALUES (gen_random_uuid(), ${variantRow.id}, ${tierInput.quantity}, ${tierInput.unitPrice ?? null}, ${tierInput.flatTotalPrice ?? null}, ${tierIndex})
        RETURNING *
      `) as unknown as CatalogPriceTierRow[];
      tierRows.push(insertedTierRows[0]!);
      tierIndex += 1;
    }
    variantIndex += 1;
  }

  return { variantRows, tierRows };
}

function buildDetail(productRow: CatalogProductRow, variantRows: CatalogProductVariantRow[], tierRows: CatalogPriceTierRow[]): CatalogProductDetail {
  const product = toProduct(productRow);
  const tiers = tierRows.map(toTier);
  const variants = variantRows.map(toVariant).map((variant) => toVariantWithTiers(variant, tiers));
  return { ...product, variants };
}

export const productCatalogRepo: CatalogProductRepository = {
  async list(businessId: string, query: CatalogProductListQuery): Promise<Paged<CatalogProductSummary>> {
    const productRows = (await sql`
      SELECT * FROM catalog_products WHERE business_id = ${businessId}
    `) as unknown as CatalogProductRow[];
    const variantRows = (await sql`
      SELECT id, product_id, unit_price, package_quantity, package_total_price FROM catalog_product_variants
      WHERE product_id IN (SELECT id FROM catalog_products WHERE business_id = ${businessId})
    `) as unknown as ListVariantRow[];
    // Only `tiered` products need this — fetched unconditionally to match
    // every other repo's "fetch everything, filter/sort in JS" convention
    // (see `product-repo.ts#list`'s movements fetch for the precedent).
    const tierRows = (await sql`
      SELECT id, variant_id, unit_price, flat_total_price FROM catalog_price_tiers
      WHERE variant_id IN (
        SELECT id FROM catalog_product_variants
        WHERE product_id IN (SELECT id FROM catalog_products WHERE business_id = ${businessId})
      )
    `) as unknown as ListTierRow[];

    let products = productRows.map(toProduct);

    if (query.status) {
      const wantActive = query.status === "active";
      products = products.filter((product) => product.active === wantActive);
    }
    if (query.category) {
      products = products.filter((product) => product.category === query.category);
    }
    if (query.pricingMode) {
      products = products.filter((product) => product.pricingMode === query.pricingMode);
    }
    if (query.q) {
      const needle = query.q.trim().toLowerCase();
      products = products.filter((product) => product.name.toLowerCase().includes(needle));
    }

    const summaries: SortableCatalogSummary[] = products.map((product) => ({
      ...product,
      variantCount: variantRows.filter((row) => String(row.product_id) === String(product.id)).length,
      lowestPriceCents: lowestPriceCents(product, variantRows, tierRows),
    }));

    const sorted = catalogProductSorter.sort(summaries, query);
    const paged = paginate(sorted, query.page, query.pageSize);
    // `lowestPriceCents` is sort-only plumbing — never leaked on the summary.
    return { ...paged, data: paged.data.map(({ lowestPriceCents: _lowestPriceCents, ...summary }) => summary) };
  },

  async getById(businessId: string, id: string): Promise<CatalogProductDetail | null> {
    const productRows = (await sql`SELECT * FROM catalog_products WHERE id = ${id}`) as unknown as CatalogProductRow[];
    const productRow = productRows[0];
    if (!productRow || productRow.business_id !== businessId) return null;

    const variantRows = (await sql`
      SELECT * FROM catalog_product_variants WHERE product_id = ${id} ORDER BY sort_order
    `) as unknown as CatalogProductVariantRow[];
    const tierRows = (await sql`
      SELECT * FROM catalog_price_tiers
      WHERE variant_id IN (SELECT id FROM catalog_product_variants WHERE product_id = ${id})
      ORDER BY sort_order
    `) as unknown as CatalogPriceTierRow[];

    return buildDetail(productRow, variantRows, tierRows);
  },

  /** Atomic: header + every variant + every tier in ONE transaction. */
  async create(businessId: string, data: CatalogProductCreate): Promise<CatalogProductDetail> {
    const { productRow, variantRows, tierRows } = await runTransaction(async (tx) => {
      const productRows = (await tx`
        INSERT INTO catalog_products (id, business_id, name, category, description, pricing_mode, min_order_quantity, fixed_unit_price, area_base_price, area_rate_per_m2, area_min_price, active)
        VALUES (gen_random_uuid(), ${businessId}, ${data.name}, ${data.category ?? null}, ${data.description ?? null}, ${data.pricingMode}, ${data.minOrderQuantity ?? 1}, ${data.fixedUnitPrice ?? null}, ${data.areaBasePrice ?? null}, ${data.areaRatePerM2 ?? null}, ${data.areaMinPrice ?? null}, true)
        RETURNING *
      `) as unknown as CatalogProductRow[];
      const productRow = productRows[0]!;

      const { variantRows, tierRows } = await insertVariantsAndTiers(tx, productRow.id, data.variants);

      return { productRow, variantRows, tierRows };
    });

    return buildDetail(productRow, variantRows, tierRows);
  },

  /**
   * Variants and tiers are replaced wholesale (delete + re-insert) on every
   * edit — see `CatalogProductRepository.update`'s doc comment. NO edit-lock:
   * unlike `invoice-repo.ts#update`, there is no payment state to protect, so
   * this is a plain read-then-transact, not a `SELECT ... FOR UPDATE` guard.
   * Deleting a product's variants CASCADEs their tiers automatically (see
   * `catalog_price_tiers.variant_id`'s `ON DELETE CASCADE`), so a single
   * `DELETE FROM catalog_product_variants` is enough to clear both tables.
   */
  async update(businessId: string, id: string, data: CatalogProductUpdate): Promise<CatalogProductDetail | null> {
    const existingRows = (await sql`SELECT * FROM catalog_products WHERE id = ${id}`) as unknown as CatalogProductRow[];
    const existingRow = existingRows[0];
    if (!existingRow || existingRow.business_id !== businessId) return null;
    const existing = toProduct(existingRow);

    const merged = {
      name: data.name ?? existing.name,
      category: data.category !== undefined ? data.category : existing.category,
      description: data.description !== undefined ? data.description : existing.description,
      pricingMode: data.pricingMode ?? existing.pricingMode,
      minOrderQuantity: data.minOrderQuantity ?? existing.minOrderQuantity,
      fixedUnitPrice: data.fixedUnitPrice !== undefined ? data.fixedUnitPrice : existing.fixedUnitPrice,
      areaBasePrice: data.areaBasePrice !== undefined ? data.areaBasePrice : existing.areaBasePrice,
      areaRatePerM2: data.areaRatePerM2 !== undefined ? data.areaRatePerM2 : existing.areaRatePerM2,
      areaMinPrice: data.areaMinPrice !== undefined ? data.areaMinPrice : existing.areaMinPrice,
      active: data.active ?? existing.active,
    };

    const { productRow, variantRows, tierRows } = await runTransaction(async (tx) => {
      const productRows = (await tx`
        UPDATE catalog_products SET
          name = ${merged.name},
          category = ${merged.category},
          description = ${merged.description},
          pricing_mode = ${merged.pricingMode},
          min_order_quantity = ${merged.minOrderQuantity},
          fixed_unit_price = ${merged.fixedUnitPrice},
          area_base_price = ${merged.areaBasePrice},
          area_rate_per_m2 = ${merged.areaRatePerM2},
          area_min_price = ${merged.areaMinPrice},
          active = ${merged.active},
          updated_at = now()
        WHERE id = ${id}
        RETURNING *
      `) as unknown as CatalogProductRow[];
      const productRow = productRows[0]!;

      // Wholesale replace: CASCADE takes care of the tiers.
      await tx`DELETE FROM catalog_product_variants WHERE product_id = ${id}`;

      const { variantRows, tierRows } = await insertVariantsAndTiers(tx, id, data.variants);

      return { productRow, variantRows, tierRows };
    });

    return buildDetail(productRow, variantRows, tierRows);
  },

  /** Distinct non-null `category` values for this business, sorted — backs the list page's filter. */
  async listCategories(businessId: string): Promise<string[]> {
    const rows = (await sql`
      SELECT DISTINCT category FROM catalog_products
      WHERE business_id = ${businessId} AND category IS NOT NULL
      ORDER BY category
    `) as unknown as { category: string }[];
    return rows.map((row) => row.category);
  },
};
