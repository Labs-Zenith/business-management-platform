/**
 * Shared JS-side computation for `ProductWithStock`'s derived fields
 * (`currentQuantity`/`totalValue`/`isLowStock`), per
 * `openspec/changes/inventario/specs/inventory-tracking/spec.md`. Mirrors
 * `lib/services/status.ts`'s precedent (a SINGLE shared function imported by
 * both `lib/mock/invoice-repo.ts` and `lib/db/invoice-repo.ts`) rather than
 * letting `lib/mock/product-repo.ts` and `lib/db/product-repo.ts`
 * independently re-derive the identical reduce/comparison logic.
 *
 * Callers are responsible for filtering `movements` down to the ones
 * belonging to `product` BEFORE calling this function — that filtering
 * (Map value iteration in the mock repo, `product_id` matching over a
 * business-wide fetch in the DB repo) is repo-specific and stays in each
 * repo's own `withStock` wrapper; only the pure math below is shared.
 *
 * The raw SQL CTE in `lib/db/inventory-repo.ts`'s atomic floor-at-zero guard
 * is a SEPARATE write-path concern and must stay as SQL — this function is
 * only for the read-path JS computation.
 *
 * LOW-STOCK RULE (Wave 1A): `isLowStock` is now a FIXED business rule — true
 * when `1 <= currentQuantity <= 3` — replacing the earlier per-product
 * configurable `minStockThreshold` comparison entirely. `minStockThreshold`
 * is gone from `ProductStockInput`/`Product`/`ProductCreate`/`ProductUpdate`
 * (`lib/services/ports.ts`, `lib/schemas/product.ts`) and from both product
 * repos' read/write; the `products.min_stock_threshold` DB column is left in
 * place, unused (no destructive migration). A product with 0 units (out of
 * stock) is NOT flagged low-stock by this rule — it's a distinct state a
 * future change may surface separately.
 */

export type StockMovementLike = {
  type: "in" | "out";
  quantity: number;
};

export type ProductStockInput = {
  unitCost: number;
};

export type ComputedStock = {
  currentQuantity: number;
  totalValue: number;
  isLowStock: boolean;
};

const LOW_STOCK_MIN = 1;
const LOW_STOCK_MAX = 3;

export function computeProductStock(product: ProductStockInput, movements: StockMovementLike[]): ComputedStock {
  const currentQuantity = movements.reduce(
    (qty, movement) => qty + (movement.type === "in" ? movement.quantity : -movement.quantity),
    0,
  );
  const totalValue = currentQuantity * product.unitCost;
  const isLowStock = currentQuantity >= LOW_STOCK_MIN && currentQuantity <= LOW_STOCK_MAX;

  return { currentQuantity, totalValue, isLowStock };
}
