import type { Paged, Product, ProductCreate, ProductListQuery, ProductRepository, ProductUpdate, ProductWithStock } from "@/lib/services/ports";
import { computeProductStock } from "@/lib/services/inventory-stock";
import { generateId, store as defaultStore, type MockStore } from "./store";

/**
 * Employee-style mock repo (list/getById/create/update, business-scoped, no
 * delete — only the `active` toggle via `update`), extended with a computed
 * `ProductWithStock` view: `list`/`getById` filter `store.inventoryMovements`
 * per product and delegate the derivation of `currentQuantity`/`totalValue`/
 * `isLowStock` to the shared `computeProductStock` (`lib/services/
 * inventory-stock.ts`), structurally mirroring `invoice-repo.ts`'s
 * `withFinance`. `products` itself NEVER stores a quantity/value column.
 */

function paginate<T>(items: T[], page: number, pageSize: number): Paged<T> {
  const start = (page - 1) * pageSize;
  return {
    data: items.slice(start, start + pageSize),
    page,
    pageSize,
    total: items.length,
  };
}

function withStock(store: MockStore, product: Product): ProductWithStock {
  const movements = [...store.inventoryMovements.values()].filter((movement) => movement.productId === product.id);
  return { ...product, ...computeProductStock(product, movements) };
}

export function createProductRepository(store: MockStore): ProductRepository {
  return {
    async list(businessId: string, query: ProductListQuery): Promise<Paged<ProductWithStock>> {
      let products = [...store.products.values()].filter((product) => product.businessId === businessId);

      if (query.status) {
        const wantActive = query.status === "active";
        products = products.filter((product) => product.active === wantActive);
      }
      if (query.q) {
        const needle = query.q.trim().toLowerCase();
        products = products.filter((product) => product.name.toLowerCase().includes(needle));
      }

      products.sort((a, b) => a.name.localeCompare(b.name));

      const withStockData = products.map((product) => withStock(store, product));
      return paginate(withStockData, query.page, query.pageSize);
    },

    async getById(businessId: string, id: string): Promise<ProductWithStock | null> {
      const product = store.products.get(id);
      if (!product || product.businessId !== businessId) {
        return null;
      }
      return withStock(store, product);
    },

    async create(businessId: string, data: ProductCreate): Promise<Product> {
      const now = new Date().toISOString();
      const product: Product = {
        id: generateId(),
        businessId,
        name: data.name,
        sku: data.sku ?? null,
        unitCost: data.unitCost,
        active: true,
        createdAt: now,
        updatedAt: now,
      };
      store.products.set(product.id, product);
      return product;
    },

    async update(businessId: string, id: string, data: ProductUpdate): Promise<Product | null> {
      const existing = store.products.get(id);
      if (!existing || existing.businessId !== businessId) {
        return null;
      }

      const updated: Product = {
        ...existing,
        ...data,
        updatedAt: new Date().toISOString(),
      };
      store.products.set(id, updated);
      return updated;
    },
  };
}

export const productRepo: ProductRepository = createProductRepository(defaultStore);
