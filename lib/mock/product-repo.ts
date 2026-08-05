import type { Paged, Product, ProductCreate, ProductDeleteResult, ProductListQuery, ProductRepository, ProductUpdate, ProductWithStock } from "@/lib/services/ports";
import { computeProductStock } from "@/lib/services/inventory-stock";
import { generateId, store as defaultStore, type MockStore } from "./store";
import { productSorter } from "@/lib/services/sorting";

/**
 * Business-scoped mock repo (list/getById/create/update/delete), extended
 * with a computed `ProductWithStock` view: `list`/`getById` filter
 * `store.inventoryMovements` per product and delegate the derivation of
 * `currentQuantity`/`totalValue`/`isLowStock` to the shared
 * `computeProductStock` (`lib/services/inventory-stock.ts`), structurally
 * mirroring `invoice-repo.ts`'s `withFinance`. `products` itself NEVER stores
 * a quantity/value column.
 *
 * UNLIKE `employee-repo.ts` (deactivate-only), a product with no billing
 * history IS hard-deletable — `delete` mirrors `lib/db/product-repo.ts`'s
 * transaction: refuse if any invoice line references it, else drop the ledger
 * rows and the product.
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

      // Sorted AFTER the stock map — mirrors `lib/db/product-repo.ts`.
      const withStockData = products.map((product) => withStock(store, product));
      return paginate(productSorter.sort(withStockData, query), query.page, query.pageSize);
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

    async delete(businessId: string, id: string): Promise<ProductDeleteResult> {
      const product = store.products.get(id);
      if (!product || product.businessId !== businessId) {
        return { outcome: "not_found" };
      }

      // Refuse once the product has been invoiced — see `ProductDeleteResult`
      // in `ports.ts`. DISTINCT invoices, since one invoice may list the same
      // product on several lines.
      const referencingInvoiceIds = new Set(
        [...store.invoiceItems.values()]
          .filter((item) => item.productId === id)
          .map((item) => item.invoiceId),
      );
      if (referencingInvoiceIds.size > 0) {
        return { outcome: "conflict", invoiceCount: referencingInvoiceIds.size };
      }

      for (const [movementId, movement] of store.inventoryMovements) {
        if (movement.productId === id) {
          store.inventoryMovements.delete(movementId);
        }
      }
      store.products.delete(id);
      return { outcome: "deleted" };
    },
  };
}

export const productRepo: ProductRepository = createProductRepository(defaultStore);
