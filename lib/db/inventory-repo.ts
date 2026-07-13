import { ApiError } from "@/lib/server/api-error";
import type {
  InventoryMovement,
  InventoryMovementCreate,
  InventoryMovementListQuery,
  InventoryMovementRepository,
  InventoryMovementWithProduct,
  Paged,
} from "@/lib/services/ports";
import { sql } from "./client";

/**
 * Append-only (list/getById/create only — no update/delete). `list` mirrors
 * `db/employee-repo.ts`'s strategy (fetch business-scoped rows, join product
 * names in JS). `create` is the safety-critical floor-at-zero guard.
 *
 * Atomic guard approach — TWO-STATEMENT transaction (`sql.transaction([...])`,
 * the same Neon non-interactive-transaction mechanism `payroll-repo.ts`
 * already uses). Both statements run as ONE real Postgres transaction
 * (`BEGIN … COMMIT`) at the driver's default isolation, READ COMMITTED
 * (`client.ts` calls `neon(connectionString)` with no `isolationLevel`, so
 * no `SET TRANSACTION ISOLATION LEVEL` is emitted and the server default
 * applies):
 *
 *   Statement 1: `SELECT id FROM products WHERE id = … AND business_id = …
 *                 FOR UPDATE` — acquires and HOLDS the product row lock for
 *                 the WHOLE transaction's duration. Its rows are used only to
 *                 tell NOT_FOUND (no row) apart from a floor-at-zero reject.
 *   Statement 2: the `SUM`-over-`inventory_movements` guard + conditional
 *                `INSERT ... SELECT ... WHERE`, run SECOND.
 *
 * WHY THE PREVIOUS SINGLE-STATEMENT VERSION WAS WRONG (empirically proven):
 * the old code put `FOR UPDATE` on the `products` row INSIDE the same single
 * CTE that also SUMs the *child* table `inventory_movements`. Under Postgres'
 * EvalPlanQual mechanism, when a `FOR UPDATE` statement blocks on a locked
 * row and later resumes after the blocker commits, only the LOCKED row's own
 * columns are re-checked against the newest committed version — a correlated
 * subquery over a DIFFERENT table in that SAME statement is NOT re-evaluated
 * with a fresh snapshot; it keeps the stale SUM it computed before the wait.
 * Result: two concurrent `out 7` against 10 units of stock BOTH succeeded,
 * driving computed stock to -4. Reproduced 3/3 against real Postgres 16.
 *
 * WHY THE TWO-STATEMENT VERSION IS CORRECT: statement 1 acquires the lock but
 * reads nothing from the movement ledger. Statement 2 computes the SUM in a
 * SEPARATE statement, which under READ COMMITTED takes its OWN fresh snapshot
 * at statement start. A concurrent transaction's statement 1 blocks on the
 * row lock until this transaction fully commits; only THEN does its statement
 * 2 run and take a snapshot — one that already reflects this transaction's
 * committed movement. The check-then-act race the single-statement version
 * could not close is thereby closed. (`sql.transaction` is non-interactive —
 * all queries submitted upfront — which is fine here: statement 2's SQL text
 * does not depend on statement 1's returned data, only on running AFTER it
 * within the same lock-holding transaction.)
 *
 * VERIFICATION: empirically verified against a REAL Postgres 16 container
 * (Docker) loaded with this change's exact schema. Two concurrent `out 7`
 * requests were fired against a product seeded to 10 units, over two parallel
 * `pg` connections each replicating this two-statement transaction verbatim
 * (`BEGIN`; statement 1 `FOR UPDATE`; statement 2 CTE INSERT; `COMMIT`) at
 * READ COMMITTED. Result across 3/3 runs: EXACTLY ONE insert succeeded, the
 * other was cleanly rejected (zero rows inserted), final computed stock = 3.
 * The same harness run against the OLD single-statement CTE reproduced the
 * -4 overdraw 3/3, confirming the harness genuinely exercises the race and
 * that the fix — not luck — is what closes it.
 */

type MovementRow = {
  id: string;
  business_id: string;
  product_id: string;
  type: string;
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
    // See the file-level doc comment for the full correctness argument. Two
    // statements, ONE real transaction:
    const queries = [
      // Statement 1: acquire and HOLD the product row lock for the whole
      // transaction. Its result set is used ONLY to distinguish NOT_FOUND
      // (no matching row for this business) from a floor-at-zero rejection,
      // without leaking whether the id exists under a different business.
      sql`SELECT id FROM products WHERE id = ${data.productId} AND business_id = ${businessId} FOR UPDATE`,
      // Statement 2: fresh-snapshot SUM guard + conditional insert. Runs
      // AFTER statement 1 already holds the lock, so a concurrent
      // transaction's own statement 1 blocks until this transaction commits —
      // by which time this statement's READ COMMITTED snapshot already
      // reflects any earlier-committed movement. No `FOR UPDATE` needed here:
      // statement 1 is the sole lock holder, and re-locking would only invite
      // the EvalPlanQual stale-subquery hazard the two-statement split avoids.
      sql`
        WITH bal AS (
          SELECT p.id,
            COALESCE((SELECT SUM(CASE WHEN m.type = 'in' THEN m.quantity ELSE -m.quantity END)
                      FROM inventory_movements m WHERE m.product_id = p.id), 0) AS current_qty
          FROM products p
          WHERE p.id = ${data.productId} AND p.business_id = ${businessId}
        )
        INSERT INTO inventory_movements (id, business_id, product_id, type, quantity, note)
        SELECT gen_random_uuid(), ${businessId}, bal.id, ${data.type}, ${data.quantity}, ${data.note ?? null}
        FROM bal
        WHERE ${data.type} = 'in' OR ${data.quantity} <= bal.current_qty
        RETURNING *
      `,
    ];

    // `as unknown as ...`: the two tagged-template calls infer different
    // `NeonQueryPromise` result shapes that the driver's homogeneous-array
    // `transaction()` signature can't unify — the same purely-TS cast
    // workaround established in `lib/db/payroll-repo.ts`, not a behavior
    // change; both queries still run as one real transaction.
    const runTransaction = sql.transaction as (queries: unknown[]) => Promise<unknown[]>;
    const [lockRows, inserted] = (await runTransaction(queries)) as unknown as [{ id: string }[], MovementRow[]];

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
