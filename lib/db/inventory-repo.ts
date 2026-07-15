import { ApiError } from "@/lib/server/api-error";
import type {
  InventoryMovement,
  InventoryMovementCreate,
  InventoryMovementListQuery,
  InventoryMovementRepository,
  InventoryMovementWithProduct,
  Paged,
} from "@/lib/services/ports";
import { runTransaction, sql } from "./client";

/**
 * Append-only (list/getById/create only — no update/delete). `list` mirrors
 * `db/employee-repo.ts`'s strategy (fetch business-scoped rows, join product
 * names in JS). `create` is the safety-critical floor-at-zero guard.
 *
 * Concurrency guard: the shared TWO-STATEMENT `FOR UPDATE` pattern — see
 * `client.ts`'s `runTransaction` canonical note for the mechanism and why a
 * single inline-`FOR UPDATE` statement is insufficient.
 *
 * FILE-SPECIFIC details:
 *   - Statement 1 locks the `products` row; statement 2 is the
 *     `SUM`-over-`inventory_movements` floor-at-zero guard + conditional
 *     `INSERT ... SELECT ... WHERE`. (The correlated aggregate is over a
 *     DIFFERENT table than the locked row — exactly the EvalPlanQual hazard
 *     the split avoids.)
 *   - Empirical run count: verified against a real Postgres 16 container —
 *     two concurrent `out 7` against a product seeded to 10 units gave EXACTLY
 *     ONE success 3/3 (final stock = 3); the old single-CTE version reproduced
 *     the -4 overdraw 3/3.
 */

type MovementRow = {
  id: string;
  business_id: string;
  product_id: string;
  type: string;
  type_id: string;
  quantity: number;
  note: string | null;
  created_at: string;
};

type ProductNameRow = { id: string; name: string };

function toMovement(row: MovementRow): InventoryMovement {
  return {
    id: row.id,
    businessId: row.business_id,
    productId: row.product_id,
    type: row.type as InventoryMovement["type"],
    typeId: row.type_id,
    quantity: Number(row.quantity),
    note: row.note,
    createdAt: new Date(row.created_at).toISOString(),
  };
}

function paginate<T>(items: T[], page: number, pageSize: number): Paged<T> {
  return { data: items.slice((page - 1) * pageSize, (page - 1) * pageSize + pageSize), page, pageSize, total: items.length };
}

export const inventoryRepo: InventoryMovementRepository = {
  async list(businessId: string, query: InventoryMovementListQuery): Promise<Paged<InventoryMovementWithProduct>> {
    const rows = (await sql`SELECT * FROM inventory_movements WHERE business_id = ${businessId}`) as unknown as MovementRow[];
    const productRows = (await sql`SELECT id, name FROM products WHERE business_id = ${businessId}`) as unknown as ProductNameRow[];

    let movements = rows.map(toMovement);

    if (query.productId) movements = movements.filter((m) => m.productId === query.productId);
    if (query.type) movements = movements.filter((m) => m.type === query.type);
    if (query.from) movements = movements.filter((m) => m.createdAt >= query.from!);
    if (query.to) movements = movements.filter((m) => m.createdAt <= query.to!);

    movements.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));

    const withProduct: InventoryMovementWithProduct[] = movements.map((m) => {
      const product = productRows.find((p) => String(p.id) === String(m.productId));
      return { ...m, product: { id: m.productId, name: product?.name ?? "" } };
    });

    return paginate(withProduct, query.page, query.pageSize);
  },

  async getById(businessId: string, id: string): Promise<InventoryMovementWithProduct | null> {
    const rows = (await sql`SELECT * FROM inventory_movements WHERE id = ${id}`) as unknown as MovementRow[];
    const row = rows[0];
    if (!row || row.business_id !== businessId) return null;

    const productRows = (await sql`SELECT id, name FROM products WHERE id = ${row.product_id}`) as unknown as ProductNameRow[];
    const movement = toMovement(row);
    return { ...movement, product: { id: movement.productId, name: productRows[0]?.name ?? "" } };
  },

  async create(businessId: string, data: InventoryMovementCreate): Promise<InventoryMovement> {
    // Two statements, ONE real transaction (see `client.ts`'s canonical
    // note), run as sequential awaits inside the `runTransaction` callback:
    const { lockRows, inserted } = await runTransaction(async (tx) => {
      // Statement 1: acquire and HOLD the product row lock for the whole
      // transaction. Its result set distinguishes NOT_FOUND from a
      // floor-at-zero rejection without leaking cross-business existence.
      const lockRows = (await tx`
        SELECT id FROM products WHERE id = ${data.productId} AND business_id = ${businessId} FOR UPDATE
      `) as unknown as { id: string }[];

      // Statement 2: fresh-snapshot SUM guard + conditional insert, run AFTER
      // statement 1 holds the lock (no `FOR UPDATE` here — it is the sole lock
      // holder; re-locking would reintroduce the EvalPlanQual stale-subquery
      // hazard the split avoids). `type_id` is resolved in this SAME
      // statement (no extra round trip): the caller-supplied `data.typeId`
      // wins when present, otherwise it's looked up from `movement_types` by
      // `type`'s code — `type` is always populated (required, enum-checked),
      // so this always resolves against the seeded catalog.
      const inserted = (await tx`
        WITH bal AS (
          SELECT p.id,
            COALESCE((SELECT SUM(CASE WHEN m.type = 'in' THEN m.quantity ELSE -m.quantity END)
                      FROM inventory_movements m WHERE m.product_id = p.id), 0) AS current_qty
          FROM products p
          WHERE p.id = ${data.productId} AND p.business_id = ${businessId}
        )
        INSERT INTO inventory_movements (id, business_id, product_id, type, type_id, quantity, note)
        SELECT gen_random_uuid(), ${businessId}, bal.id, ${data.type},
          COALESCE(${data.typeId ?? null}::uuid, (SELECT id FROM movement_types WHERE code = ${data.type})),
          ${data.quantity}, ${data.note ?? null}
        FROM bal
        WHERE ${data.type} = 'in' OR ${data.quantity} <= bal.current_qty
        RETURNING *
      `) as unknown as MovementRow[];

      return { lockRows, inserted };
    });

    if (lockRows.length === 0) {
      // Statement 1 matched no product row for this business.
      throw new ApiError("NOT_FOUND", "Product not found");
    }
    if (inserted.length === 0) {
      // Product exists, but statement 2's floor-at-zero `WHERE` excluded the
      // insert → over-draw rejected with ZERO mutation, not a NOT_FOUND.
      throw new ApiError("VALIDATION_ERROR", "Movement would drive stock below zero");
    }

    return toMovement(inserted[0]!);
  },
};
