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
 */

export type StockMovementLike = {
  type: "in" | "out";
  quantity: number;
};

export type ProductStockInput = {
  unitCost: number;
  minStockThreshold: number;
};

export type ComputedStock = {
  currentQuantity: number;
  totalValue: number;
  isLowStock: boolean;
};

export function computeProductStock(product: ProductStockInput, movements: StockMovementLike[]): ComputedStock {
  const currentQuantity = movements.reduce(
    (qty, movement) => qty + (movement.type === "in" ? movement.quantity : -movement.quantity),
    0,
  );
  const totalValue = currentQuantity * product.unitCost;
  const isLowStock = currentQuantity < product.minStockThreshold;

  return { currentQuantity, totalValue, isLowStock };
}
