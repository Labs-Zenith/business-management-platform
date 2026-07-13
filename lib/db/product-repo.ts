import type { Paged, Product, ProductCreate, ProductListQuery, ProductRepository, ProductUpdate, ProductWithStock } from "@/lib/services/ports";
import { computeProductStock } from "@/lib/services/inventory-stock";
import { sql } from "./client";

/**
 * Mirrors `db/employee-repo.ts`'s strategy: fetch business-scoped rows via a
 * simple parameterized query, filter/sort/paginate in JS. Extended with the
 * same computed-stock derivation as `mock/product-repo.ts`: fetch ALL
 * business movements once, group them in JS per product, and delegate the
 * derivation of `currentQuantity`/`totalValue`/`isLowStock` to the shared
 * `computeProductStock` (`lib/services/inventory-stock.ts`) — mirrors
 * `invoice-repo.list`'s payment aggregation. `products` NEVER stores a
 * quantity/value column.
 */

type ProductRow = {
  id: string;
  business_id: string;
  name: string;
  sku: string | null;
  unit_cost: number;
  min_stock_threshold: number;
  active: boolean;
  created_at: string;
  updated_at: string;
};

type MovementRow = {
  id: string;
  product_id: string;
  type: string;
  quantity: number;
};

function toProduct(row: ProductRow): Product {
  return {
    id: row.id,
    businessId: row.business_id,
    name: row.name,
    sku: row.sku,
    unitCost: Number(row.unit_cost),
    minStockThreshold: Number(row.min_stock_threshold),
    active: row.active,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

function withStock(product: Product, movements: MovementRow[]): ProductWithStock {
  const productMovements = movements
    .filter((movement) => String(movement.product_id) === String(product.id))
    .map((movement) => ({ type: movement.type as "in" | "out", quantity: Number(movement.quantity) }));
  return { ...product, ...computeProductStock(product, productMovements) };
}

function paginate<T>(items: T[], page: number, pageSize: number): Paged<T> {
  const start = (page - 1) * pageSize;
  return { data: items.slice(start, start + pageSize), page, pageSize, total: items.length };
}

export const productRepo: ProductRepository = {
  async list(businessId: string, query: ProductListQuery): Promise<Paged<ProductWithStock>> {
    const rows = (await sql`SELECT * FROM products WHERE business_id = ${businessId}`) as unknown as ProductRow[];
    const movementRows = (await sql`SELECT id, product_id, type, quantity FROM inventory_movements WHERE business_id = ${businessId}`) as unknown as MovementRow[];

    let products = rows.map(toProduct);

    if (query.status) {
      const wantActive = query.status === "active";
      products = products.filter((p) => p.active === wantActive);
    }
    if (query.q) {
      const needle = query.q.trim().toLowerCase();
      products = products.filter((p) => p.name.toLowerCase().includes(needle));
    }
    products.sort((a, b) => a.name.localeCompare(b.name));

    const withStockData = products.map((product) => withStock(product, movementRows));
    return paginate(withStockData, query.page, query.pageSize);
  },

  async getById(businessId: string, id: string): Promise<ProductWithStock | null> {
    const rows = (await sql`SELECT * FROM products WHERE id = ${id}`) as unknown as ProductRow[];
    const row = rows[0];
    if (!row || row.business_id !== businessId) return null;

    const movementRows = (await sql`SELECT id, product_id, type, quantity FROM inventory_movements WHERE product_id = ${id}`) as unknown as MovementRow[];
    return withStock(toProduct(row), movementRows);
  },

  async create(businessId: string, data: ProductCreate): Promise<Product> {
    const rows = (await sql`
      INSERT INTO products (id, business_id, name, sku, unit_cost, min_stock_threshold, active)
      VALUES (gen_random_uuid(), ${businessId}, ${data.name}, ${data.sku ?? null}, ${data.unitCost}, ${data.minStockThreshold ?? 0}, true)
      RETURNING *
    `) as unknown as ProductRow[];
    return toProduct(rows[0]!);
  },

  async update(businessId: string, id: string, data: ProductUpdate): Promise<Product | null> {
    const existingRows = (await sql`SELECT * FROM products WHERE id = ${id}`) as unknown as ProductRow[];
    const existing = existingRows[0];
    if (!existing || existing.business_id !== businessId) return null;

    const merged = { ...toProduct(existing), ...data };
    const rows = (await sql`
      UPDATE products SET
        name = ${merged.name},
        sku = ${merged.sku},
        unit_cost = ${merged.unitCost},
        min_stock_threshold = ${merged.minStockThreshold},
        active = ${merged.active},
        updated_at = now()
      WHERE id = ${id}
      RETURNING *
    `) as unknown as ProductRow[];
    return toProduct(rows[0]!);
  },
};
