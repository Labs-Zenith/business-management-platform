import type { Paged, Product, ProductCreate, ProductDeleteResult, ProductListQuery, ProductRepository, ProductUpdate, ProductWithStock } from "@/lib/services/ports";
import { computeProductStock } from "@/lib/services/inventory-stock";
import { runTransaction, sql } from "./client";
import { productSorter } from "@/lib/services/sorting";

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
    // Sorted AFTER the stock map, not before it (as the old fixed name sort
    // was): `currentQuantity` and `totalValue` are sortable columns and do not
    // exist until here.
    const withStockData = products.map((product) => withStock(product, movementRows));
    return paginate(productSorter.sort(withStockData, query), query.page, query.pageSize);
  },

  async getById(businessId: string, id: string): Promise<ProductWithStock | null> {
    const rows = (await sql`SELECT * FROM products WHERE id = ${id}`) as unknown as ProductRow[];
    const row = rows[0];
    if (!row || row.business_id !== businessId) return null;

    const movementRows = (await sql`SELECT id, product_id, type, quantity FROM inventory_movements WHERE product_id = ${id}`) as unknown as MovementRow[];
    return withStock(toProduct(row), movementRows);
  },

  async create(businessId: string, data: ProductCreate): Promise<Product> {
    // `min_stock_threshold` is intentionally NEVER written by app code
    // anymore (Wave 1A) — it keeps its DB `DEFAULT 0`, unused; low-stock is a
    // fixed rule (`lib/services/inventory-stock.ts`), not a per-row column.
    const rows = (await sql`
      INSERT INTO products (id, business_id, name, sku, unit_cost, active)
      VALUES (gen_random_uuid(), ${businessId}, ${data.name}, ${data.sku ?? null}, ${data.unitCost}, true)
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
        active = ${merged.active},
        updated_at = now()
      WHERE id = ${id}
      RETURNING *
    `) as unknown as ProductRow[];
    return toProduct(rows[0]!);
  },

  async delete(businessId: string, id: string): Promise<ProductDeleteResult> {
    // Guarded hard delete: a product that has ever been invoiced is refused,
    // so billing history can always be traced back to what was sold. Same
    // shape and reasoning as `customer-repo.ts#delete`.
    return runTransaction(async (tx) => {
      // Statement 1: acquire and HOLD the product row lock for the rest of
      // the transaction — the two-statement pattern from `client.ts`'s
      // canonical note. This is what makes the count below race-safe: a
      // concurrent `INSERT INTO invoice_items` needs a `FOR KEY SHARE` lock
      // on THIS row to validate its FK, so it cannot slip a new line in
      // between the count and the delete.
      const lockRows = (await tx`
        SELECT id FROM products WHERE id = ${id} AND business_id = ${businessId} FOR UPDATE
      `) as unknown as { id: string }[];
      if (lockRows.length === 0) return { outcome: "not_found" } as const;

      // Statement 2: fresh-snapshot reference count. `invoice_items` carries
      // no `business_id` of its own, hence the join to `invoices`. DISTINCT
      // invoice_id, not row count — the message counts invoices, and one
      // invoice may list the same product on several lines.
      const countRows = (await tx`
        SELECT COUNT(DISTINCT ii.invoice_id)::int AS invoice_count
        FROM invoice_items ii
        JOIN invoices i ON i.id = ii.invoice_id
        WHERE ii.product_id = ${id} AND i.business_id = ${businessId}
      `) as unknown as { invoice_count: number }[];
      const invoiceCount = Number(countRows[0]!.invoice_count);
      if (invoiceCount > 0) {
        return { outcome: "conflict", invoiceCount } as const;
      }

      // Zero references confirmed under the lock. Drop the ledger first —
      // `inventory_movements.product_id` is NOT NULL with ON DELETE NO ACTION,
      // so the FK order matters.
      await tx`DELETE FROM inventory_movements WHERE product_id = ${id} AND business_id = ${businessId}`;
      await tx`DELETE FROM products WHERE id = ${id} AND business_id = ${businessId}`;
      return { outcome: "deleted" } as const;
    });
  },
};
