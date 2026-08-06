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
  Paged,
} from "@/lib/services/ports";
import { CATALOG_PRODUCT_SORT_KEYS } from "@/lib/services/ports";
import { createSorter, numberKey, textKey } from "@/lib/services/sorting";
import { generateId, store as defaultStore, type MockStore } from "./store";

/**
 * Mirrors `product-repo.ts`'s CRUD shape (business-scoped, no delete — only
 * the `active` toggle via `update`), extended with the catalog's two child
 * tables (`catalogProductVariants`/`catalogPriceTiers`), which carry NO
 * `businessId` of their own and scope entirely through the parent product —
 * see `MockStore.catalogProducts`'s doc comment. `create`/`update` are
 * "atomic" here simply because nothing awaits between the header write and
 * the variant/tier writes (single-threaded JS); no `withLock` is needed since
 * there is no shared counter/sequence to serialize (unlike quote/invoice
 * numbering).
 */

function variantsForProduct(store: MockStore, productId: string): CatalogProductVariant[] {
  return [...store.catalogProductVariants.values()]
    .filter((variant) => variant.productId === productId)
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

function tiersForVariant(store: MockStore, variantId: string): CatalogPriceTier[] {
  return [...store.catalogPriceTiers.values()]
    .filter((tier) => tier.variantId === variantId)
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

/** `minOrderQuantity` is DERIVED at read time as `MIN(tiers[].quantity)`, never stored — see `CatalogProductVariantWithTiers`'s doc comment. */
function deriveMinOrderQuantity(tiers: CatalogPriceTier[]): number | null {
  if (tiers.length === 0) return null;
  return Math.min(...tiers.map((tier) => tier.quantity));
}

function toVariantWithTiers(store: MockStore, variant: CatalogProductVariant): CatalogProductVariantWithTiers {
  const tiers = tiersForVariant(store, variant.id);
  return { ...variant, tiers, minOrderQuantity: deriveMinOrderQuantity(tiers) };
}

function toDetail(store: MockStore, product: CatalogProduct): CatalogProductDetail {
  const variants = variantsForProduct(store, product.id).map((variant) => toVariantWithTiers(store, variant));
  return { ...product, variants };
}

function toSummary(store: MockStore, product: CatalogProduct): CatalogProductSummary {
  return { ...product, variantCount: variantsForProduct(store, product.id).length };
}

/**
 * The lowest price a customer could pay for `product`, used ONLY to order
 * the "Precio" column. Mirrors `lib/db/product-catalog-repo.ts`'s function of
 * the same name (see its doc comment for the full per-mode rationale, which
 * this duplicates rather than shares — see `catalogProductSorter`'s doc
 * comment below) and
 * `app/(dashboard)/catalogo/[id]/page.tsx#priceRangeLabel`'s per-mode
 * branches, taking the MIN branch of each. `null` when the mode has no
 * priced variant/tier yet, which `numberKey` sorts last regardless of
 * direction.
 */
function lowestPriceCents(store: MockStore, product: CatalogProduct): number | null {
  switch (product.pricingMode) {
    case "fixed":
      return product.fixedUnitPrice;
    case "area":
      return product.areaBasePrice;
    case "variant": {
      const prices = variantsForProduct(store, product.id)
        .map((variant) => variant.unitPrice)
        .filter((price): price is number => price !== null);
      return prices.length > 0 ? Math.min(...prices) : null;
    }
    case "package": {
      const prices = variantsForProduct(store, product.id)
        .map((variant) => variant.packageTotalPrice)
        .filter((price): price is number => price !== null);
      return prices.length > 0 ? Math.min(...prices) : null;
    }
    case "tiered": {
      const prices = variantsForProduct(store, product.id)
        .flatMap((variant) => tiersForVariant(store, variant.id))
        .map((tier) => tier.unitPrice ?? tier.flatTotalPrice)
        .filter((price): price is number => price !== null);
      return prices.length > 0 ? Math.min(...prices) : null;
    }
  }
}

type SortableCatalogSummary = CatalogProductSummary & { lowestPriceCents: number | null };

/**
 * Built with the SAME `createSorter`/`textKey`/`numberKey` machinery every
 * other entity sorter uses (`lib/services/sorting.ts`), but NOT registered
 * there — see `lib/db/product-catalog-repo.ts`'s identical sorter for why.
 * Duplicated verbatim between the two repos so they cannot diverge.
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

function paginate<T>(items: T[], page: number, pageSize: number): Paged<T> {
  const start = (page - 1) * pageSize;
  return { data: items.slice(start, start + pageSize), page, pageSize, total: items.length };
}

/** Deletes every variant (and, transitively, every tier) belonging to `productId` — the wholesale-replace half of `update`. */
function deleteVariantsAndTiers(store: MockStore, productId: string): void {
  const variantIds = new Set(variantsForProduct(store, productId).map((variant) => variant.id));
  for (const [tierId, tier] of store.catalogPriceTiers) {
    if (variantIds.has(tier.variantId)) store.catalogPriceTiers.delete(tierId);
  }
  for (const [variantId, variant] of store.catalogProductVariants) {
    if (variant.productId === productId) store.catalogProductVariants.delete(variantId);
  }
}

/** Inserts every variant (and its tiers) of `data.variants` under `productId` — the insert half of both `create` and `update`. */
function insertVariantsAndTiers(store: MockStore, productId: string, variants: CatalogProductCreate["variants"]): void {
  (variants ?? []).forEach((variantInput, variantIndex) => {
    const variant: CatalogProductVariant = {
      id: generateId(),
      productId,
      name: variantInput.name,
      description: variantInput.description ?? null,
      sortOrder: variantInput.sortOrder ?? variantIndex,
      unitPrice: variantInput.unitPrice ?? null,
      packageQuantity: variantInput.packageQuantity ?? null,
      packageTotalPrice: variantInput.packageTotalPrice ?? null,
      active: true,
    };
    store.catalogProductVariants.set(variant.id, variant);

    (variantInput.tiers ?? []).forEach((tierInput, tierIndex) => {
      const tier: CatalogPriceTier = {
        id: generateId(),
        variantId: variant.id,
        quantity: tierInput.quantity,
        unitPrice: tierInput.unitPrice ?? null,
        flatTotalPrice: tierInput.flatTotalPrice ?? null,
        sortOrder: tierIndex,
      };
      store.catalogPriceTiers.set(tier.id, tier);
    });
  });
}

export function createProductCatalogRepository(store: MockStore): CatalogProductRepository {
  return {
    async list(businessId: string, query: CatalogProductListQuery): Promise<Paged<CatalogProductSummary>> {
      let products = [...store.catalogProducts.values()].filter((product) => product.businessId === businessId);

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
        ...toSummary(store, product),
        lowestPriceCents: lowestPriceCents(store, product),
      }));

      const sorted = catalogProductSorter.sort(summaries, query);
      const paged = paginate(sorted, query.page, query.pageSize);
      // `lowestPriceCents` is sort-only plumbing — never leaked on the summary.
      return { ...paged, data: paged.data.map(({ lowestPriceCents: _lowestPriceCents, ...summary }) => summary) };
    },

    async getById(businessId: string, id: string): Promise<CatalogProductDetail | null> {
      const product = store.catalogProducts.get(id);
      if (!product || product.businessId !== businessId) {
        return null;
      }
      return toDetail(store, product);
    },

    async create(businessId: string, data: CatalogProductCreate): Promise<CatalogProductDetail> {
      const now = new Date().toISOString();
      const product: CatalogProduct = {
        id: generateId(),
        businessId,
        name: data.name,
        category: data.category ?? null,
        description: data.description ?? null,
        pricingMode: data.pricingMode,
        minOrderQuantity: data.minOrderQuantity ?? 1,
        fixedUnitPrice: data.fixedUnitPrice ?? null,
        areaBasePrice: data.areaBasePrice ?? null,
        areaRatePerM2: data.areaRatePerM2 ?? null,
        areaMinPrice: data.areaMinPrice ?? null,
        active: true,
        createdAt: now,
        updatedAt: now,
      };
      store.catalogProducts.set(product.id, product);
      insertVariantsAndTiers(store, product.id, data.variants);

      return toDetail(store, product);
    },

    async update(businessId: string, id: string, data: CatalogProductUpdate): Promise<CatalogProductDetail | null> {
      const existing = store.catalogProducts.get(id);
      if (!existing || existing.businessId !== businessId) {
        return null;
      }

      // Field-by-field merge (NOT a blind `{...existing, ...data}` spread):
      // `CatalogProductUpdate` also carries `variants`, which is not a field
      // of `CatalogProduct` at all — it lives in the separate
      // `catalogProductVariants`/`catalogPriceTiers` maps below. Spreading
      // `data` wholesale would leave a stray `variants` array dangling on the
      // stored header row, silently duplicated into the ~4KB cookie payload
      // on every serialize (see `MockStore.catalogProducts`'s doc comment).
      const updated: CatalogProduct = {
        id: existing.id,
        businessId: existing.businessId,
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
        createdAt: existing.createdAt,
        updatedAt: new Date().toISOString(),
      };
      store.catalogProducts.set(id, updated);

      // Variants/tiers replaced wholesale on every edit (delete + re-insert),
      // the same way `InvoiceRepository.update` replaces items — but with NO
      // edit-lock, since a catalog listing has no "already paid" state to
      // protect. See `CatalogProductRepository.update`'s doc comment.
      deleteVariantsAndTiers(store, id);
      insertVariantsAndTiers(store, id, data.variants);

      return toDetail(store, updated);
    },

    async listCategories(businessId: string): Promise<string[]> {
      const categories = new Set<string>();
      for (const product of store.catalogProducts.values()) {
        if (product.businessId === businessId && product.category) {
          categories.add(product.category);
        }
      }
      return [...categories].sort((a, b) => a.localeCompare(b));
    },
  };
}

export const productCatalogRepo: CatalogProductRepository = createProductCatalogRepository(defaultStore);
