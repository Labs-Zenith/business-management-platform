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

/**
 * Which way an invoice's product lines move stock, decided by the invoice
 * TYPE's catalog `code` (`lib/mock/fixtures/catalogs.ts` /
 * `migrations/1700000010000_catalogs.sql`).
 *
 * A `nota_credito` is a RETURN — the customer gives the goods back, so its
 * lines put units BACK on the shelf (`in`). Every other type moves goods out
 * to the customer (`out`): `venta` obviously, and `nota_debito` too, since a
 * debit note bills MORE (an extra charge or an additional shipment), never
 * less.
 *
 * Shared by BOTH invoice repos on purpose — same precedent as
 * `computeProductStock` above and `lib/services/status.ts`: the direction is
 * a business rule, and letting `lib/db/invoice-repo.ts` and
 * `lib/mock/invoice-repo.ts` each hardcode their own copy is exactly how they
 * would silently drift apart.
 *
 * NOTE the asymmetry in guarding: an `out` needs the atomic floor-at-zero
 * check (you cannot sell what you do not have), while an `in` never can
 * underflow and needs none. Reversing them on an edit flips that too — see
 * each repo's `update`.
 */
export const CREDIT_NOTE_CODE = "nota_credito";

export function movementDirectionFor(invoiceTypeCode: string | null | undefined): "in" | "out" {
  return invoiceTypeCode === CREDIT_NOTE_CODE ? "in" : "out";
}

/** The compensating direction used when an edit reverses an already-applied line. */
export function reverseMovementDirection(type: "in" | "out"): "in" | "out" {
  return type === "in" ? "out" : "in";
}
