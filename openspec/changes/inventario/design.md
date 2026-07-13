# Design: Inventario (stock tracking)

## Technical Approach

Two new tables (`products`, `inventory_movements`) behind the established ports-and-adapters seam. `products` stores NO quantity column; `currentQuantity` / `totalValue` / `isLowStock` are **derived at read time** by SUMming the movement ledger (`in` − `out`) per product — structurally identical to how `invoice-repo.ts#withFinance` derives `balance`/`status` from the `payments` ledger. The one safety-critical operation is the `out`-movement floor-at-zero guard: it must reject over-draw with **zero mutation** under concurrency, mirroring `payment-repo.ts`'s overpay guard (mock: `withLock(productId)` read-check-write; Postgres: single guarded CTE+INSERT).

Products are editable (Employee-style CRUD). Movements are append-only (Payment/Expense-style). No capability gating (`requireSession()` + `checkOrigin()` on mutations). Page mirrors Nomina's Tabs+`keepMounted`, `MAX_DISPLAYED_ROWS = 50`.

## Architecture Decisions

| Decision | Choice | Rejected | Rationale |
|----------|--------|----------|-----------|
| Computed-fields layer | Repo layer returns `ProductWithStock` (base `Product` + computed) | Service-layer compute | `invoice-repo` computes `withFinance` in BOTH backends' repo layer; mirror exactly so mock/Postgres stay behavior-identical and the service is a thin pass-through. |
| Computed type shape | New `ProductWithStock = Product & { currentQuantity; totalValue; isLowStock }` | Fold fields onto `Product` | Mirrors `Invoice` vs `InvoiceWithFinance` split — base type stays a faithful row image, computed view is separate. |
| SKU | Optional free text `TEXT` nullable, no UNIQUE | Unique constraint | Matches `customers.document_number` (nullable free text, no uniqueness); no codebase precedent forces uniqueness. |
| Movement product select | Active products only (client-side filter over fetched list) | Second query / all products | Exact mirror of `nomina/page.tsx`'s `activeEmployees` filter feeding `PayrollPaymentFormDialog`. |
| Movement `note` | Optional `TEXT` nullable | Required | Matches Expense/Payment/PayrollPayment `notes` convention. |
| Out-guard (Postgres) | **Two-statement `sql.transaction([...])`**: statement 1 `SELECT … FOR UPDATE` (lock), statement 2 SUM guard + conditional INSERT | (rejected) single CTE+INSERT with `FOR UPDATE` inside the CTE; bare CTE like payment-repo | The single-statement `FOR UPDATE`-in-CTE was **empirically disproven** (see Risks): Postgres' EvalPlanQual does NOT re-evaluate a correlated subquery over the *child* `inventory_movements` table when the statement resumes after a lock wait, so two concurrent `out` movements over-drew stock 3/3 against real Postgres 16. Splitting lock (statement 1) from the SUM read (statement 2) forces statement 2 to take a fresh READ COMMITTED snapshot AFTER the lock is held, closing the race. |
| `totalValue` | `currentQuantity * unit_cost` (integer cents) | Store value | Derived, never stored — same drift-avoidance rationale as quantity. |

## Data Flow

    Dialog ──POST /api/inventory-movements──→ inventory-service.recordMovement
                                                      │
                                              repositories.inventory.create
                                                      │  (atomic guard)
                        mock: withLock(productId) recompute+reject   pg: CTE+INSERT FOR UPDATE
                                                      │
    Page (Productos tab) ──list()──→ repo SUMs movements per product ──→ ProductWithStock[]

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `migrations/1700000004000_add_inventory.sql` | Create | `products` + `inventory_movements` + indexes |
| `lib/services/ports.ts` | Modify | 5 types + 2 repo interfaces |
| `lib/mock/product-repo.ts` | Create | Editable CRUD + SUM-derived stock |
| `lib/db/product-repo.ts` | Create | Same, Postgres |
| `lib/mock/inventory-repo.ts` | Create | Append-only + `withLock` out-guard |
| `lib/db/inventory-repo.ts` | Create | Append-only + CTE out-guard |
| `lib/services/product-service.ts` | Create | Employee-service-style CRUD |
| `lib/services/inventory-service.ts` | Create | `recordMovement()` pass-through |
| `lib/services/repositories.ts` | Modify | Wire `products` + `inventory` (mock/db) |
| `lib/mock/store.ts` | Modify | Maps + serialize/clear/hydrate (`?? []`) |
| `lib/mock/fixtures/{data,index}.ts` | Modify | Product + movement fixtures (excluded from `seedMinimal`) |
| `lib/schemas/{product,inventory-movement}.ts` | Create | `.strict()` Zod schemas |
| `app/api/products/route.ts` | Create | GET list / POST create |
| `app/api/products/[id]/route.ts` | Create | PATCH |
| `app/api/inventory-movements/route.ts` | Create | GET list / POST create |
| `app/(dashboard)/inventario/page.tsx` | Create | Tabs Productos/Movimientos |
| `components/domain/inventario/*` | Create | Product form + movement dialog |
| `components/layout/nav-items.ts` | Modify | Plain nav item (no `capability`) |

## Interfaces / Contracts

### Migration SQL (`1700000004000_add_inventory.sql`)

```sql
-- Up Migration
CREATE TABLE IF NOT EXISTS products (
  id UUID PRIMARY KEY,
  business_id UUID NOT NULL REFERENCES businesses(id),
  name TEXT NOT NULL,
  sku TEXT,
  unit_cost INTEGER NOT NULL,
  min_stock_threshold INTEGER NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_products_business ON products(business_id);

CREATE TABLE IF NOT EXISTS inventory_movements (
  id UUID PRIMARY KEY,
  business_id UUID NOT NULL REFERENCES businesses(id),
  product_id UUID NOT NULL REFERENCES products(id),
  type TEXT NOT NULL CHECK (type IN ('in', 'out')),
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_inventory_movements_business ON inventory_movements(business_id);
CREATE INDEX IF NOT EXISTS idx_inventory_movements_product ON inventory_movements(product_id);

-- Down Migration
DROP TABLE IF EXISTS inventory_movements CASCADE;
DROP TABLE IF EXISTS products CASCADE;
```

### Ports (`lib/services/ports.ts`)

```ts
export type Product = {
  id: string; businessId: string; name: string; sku: string | null;
  unitCost: number; minStockThreshold: number; active: boolean;
  createdAt: string; updatedAt: string;
};
export type ProductWithStock = Product & {
  currentQuantity: number; totalValue: number; isLowStock: boolean;
};
export type ProductCreate = { name: string; sku?: string | null; unitCost: number; minStockThreshold?: number };
export type ProductUpdate = Partial<ProductCreate> & { active?: boolean };
export type ProductListQuery = { q?: string; status?: "active" | "inactive"; page: number; pageSize: number };

export interface ProductRepository {
  list(businessId: string, query: ProductListQuery): Promise<Paged<ProductWithStock>>;
  getById(businessId: string, id: string): Promise<ProductWithStock | null>;
  create(businessId: string, data: ProductCreate): Promise<Product>;
  update(businessId: string, id: string, data: ProductUpdate): Promise<Product | null>;
}

export type MovementType = "in" | "out";
export type InventoryMovement = {
  id: string; businessId: string; productId: string;
  type: MovementType; quantity: number; note: string | null; createdAt: string;
};
export type InventoryMovementWithProduct = InventoryMovement & { product: Pick<Product, "id" | "name"> };
export type InventoryMovementCreate = { productId: string; type: MovementType; quantity: number; note?: string | null };
export type InventoryMovementListQuery = { productId?: string; type?: MovementType; from?: string; to?: string; page: number; pageSize: number };

export interface InventoryMovementRepository {
  list(businessId: string, query: InventoryMovementListQuery): Promise<Paged<InventoryMovementWithProduct>>;
  getById(businessId: string, id: string): Promise<InventoryMovementWithProduct | null>;
  /** Atomic, floor-at-zero: rejects an `out` that would drive computed qty < 0 with ZERO mutation. */
  create(businessId: string, data: InventoryMovementCreate): Promise<InventoryMovement>;
}
```

### Stock derivation (both repos)

`currentQuantity = Σ(in.quantity) − Σ(out.quantity)` over movements for the product; `totalValue = currentQuantity * unitCost`; `isLowStock = currentQuantity < minStockThreshold`. Mock: filter `store.inventoryMovements` by `productId`, reduce. Postgres `list`: fetch all business movements once, group in JS (mirrors `invoice-repo.list` fetching all payments then `withFinance` per invoice).

### Out-guard — Mock (`lib/mock/inventory-repo.ts`)

```ts
async create(businessId, data): Promise<InventoryMovement> {
  return withLock(data.productId, async () => {
    const product = store.products.get(data.productId);
    if (!product || product.businessId !== businessId) throw new ApiError("NOT_FOUND", "Product not found");
    const qty = movementsForProduct(store, product.id)
      .reduce((s, m) => s + (m.type === "in" ? m.quantity : -m.quantity), 0);
    await simulateLatency(); // real read→write gap; makes the lock a genuine requirement (see payment-repo)
    if (data.type === "out" && data.quantity > qty)
      throw new ApiError("VALIDATION_ERROR", "Movement would drive stock below zero");
    const now = new Date().toISOString();
    const movement: InventoryMovement = {
      id: generateId(), businessId, productId: product.id,
      type: data.type, quantity: data.quantity, note: data.note ?? null, createdAt: now,
    };
    store.inventoryMovements.set(movement.id, movement);
    return movement;
  });
}
```

### Out-guard — Postgres (`lib/db/inventory-repo.ts`)

TWO statements in ONE `sql.transaction([...])` (same mechanism as
`payroll-repo.ts`), running at the driver default READ COMMITTED. Statement 1
acquires and holds the product row lock; statement 2 reads the SUM in a
separate, fresh-snapshot statement and conditionally inserts. See Risks for why
the single-statement CTE was race-buggy.

```ts
const queries = [
  // Statement 1: lock the product row for the whole transaction. Its result
  // distinguishes NOT_FOUND (empty) from a floor-at-zero reject.
  sql`SELECT id FROM products WHERE id = ${data.productId} AND business_id = ${businessId} FOR UPDATE`,
  // Statement 2: fresh READ COMMITTED snapshot SUM guard + conditional insert.
  // No FOR UPDATE here — statement 1 is the sole lock holder.
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
const runTransaction = sql.transaction as (queries: unknown[]) => Promise<unknown[]>;
const [lockRows, inserted] = (await runTransaction(queries)) as unknown as [{ id: string }[], InventoryMovementRow[]];

if (lockRows.length === 0) throw new ApiError("NOT_FOUND", "Product not found");
if (inserted.length === 0)  // product exists but the guard rejected the over-draw
  throw new ApiError("VALIDATION_ERROR", "Movement would drive stock below zero");
return toMovement(inserted[0]);
```

### Services

- `product-service.ts`: `listProducts` / `getProduct` (NOT_FOUND) / `createProduct` / `updateProduct` — sanitized field forwarding, line-for-line `employee-service.ts`.
- `inventory-service.ts`: `listMovements` + `recordMovement(session, data)` → `repositories.inventory.create(session.businessId, data)`, thin honest wrapper like `payment-service.ts`.

### Store / fixtures

Add `products: Map<string, Product>` and `inventoryMovements: Map<string, InventoryMovement>` to `MockStore`, `SerializedStore` (arrays), `serializeStore`, `clearStore`, `createEmptyStore`, and `hydrateStore` with `?? []` (R4 back-compat for pre-change cookies). Fixtures: a few products (one active low-stock, one inactive) + seed movements; excluded from `seedMinimal`.

### Routes

`/api/products` GET+POST, `/api/products/[id]` PATCH, `/api/inventory-movements` GET+POST — copy `employees`/`payroll-payments` route shape but swap `requireCapability(...)` → `requireSession()`; keep `checkOrigin(request)` on every mutation.

## Testing Strategy

| Layer | What | Approach |
|-------|------|----------|
| Unit | Stock SUM (in−out), `isLowStock`, `totalValue` | Repo-level, both backends |
| Unit | Out-guard rejects over-draw with zero mutation | Snapshot store before/after (mirror `payment-service.test.ts`) |
| Concurrency | Two parallel out-movements can't over-draw | `Promise.all` under `withLock` (mock); document pg `FOR UPDATE` |
| Route | `requireSession()` (no capability gate), `checkOrigin` on POST/PATCH | Mirror employee route tests |

## Migration / Rollout

Additive. `migrate down` drops `inventory_movements` then `products`. No existing table touched. Pre-change cookies hydrate cleanly via `?? []`.

## Risks

**Concurrency over-draw (the safety-critical risk this design exists to close).**
Floor-at-zero must reject a concurrent `out` that would drive computed stock
negative, with ZERO mutation.

- **DISPROVEN approach (do not reintroduce)**: a SINGLE CTE+INSERT statement
  with `FOR UPDATE` on the `products` row while a correlated subquery SUMs the
  *child* `inventory_movements` table. This was **empirically falsified** — a
  reviewer stood up real Postgres 16 with this change's exact schema, seeded a
  product to 10 units, and fired two concurrent `out 7` requests using this
  exact CTE. Both succeeded (final computed stock -4) on 3/3 runs. Root cause:
  Postgres' EvalPlanQual only re-checks the LOCKED row's own columns when a
  `FOR UPDATE` statement resumes after a lock wait; a correlated subquery over
  a DIFFERENT table in the SAME statement is NOT re-evaluated with a fresh
  snapshot, so the second transaction kept the stale SUM computed before it
  blocked. Locking the parent row inside a single statement cannot force a
  fresh child-aggregate read within that same statement.
- **Adopted fix (empirically verified)**: TWO statements in one
  `sql.transaction([...])` at READ COMMITTED. Statement 1
  (`SELECT … FOR UPDATE`) acquires and holds the row lock for the whole
  transaction but reads no ledger aggregate. Statement 2 computes the SUM in a
  SEPARATE statement, which under READ COMMITTED takes its own fresh snapshot
  at statement start. A concurrent transaction's statement 1 blocks on the lock
  until this transaction commits; only then does its statement 2 run and
  snapshot the now-committed movement. Verified against real Postgres 16
  (Docker) via two parallel `pg` connections replicating the two-statement
  transaction verbatim: EXACTLY ONE `out 7` succeeded, the other cleanly
  rejected (zero rows), final computed stock 3, across 3/3 runs — while the OLD
  single-statement CTE reproduced the -4 over-draw 3/3 on the same harness.

## Open Questions

- [x] Confirm the concurrency-safe out-guard shape over Neon's non-interactive
  driver.
  **Resolved (PR1 correctness fix, empirically verified)**: the original
  single-statement `FOR UPDATE`-in-CTE was disproven against real Postgres 16
  (see Risks) — it did NOT serialize concurrent `out` movements because
  EvalPlanQual does not refresh the child-table SUM subquery on lock-wait
  resume. Replaced with a two-statement `sql.transaction([...])` (statement 1
  locks via `SELECT … FOR UPDATE`; statement 2 does the fresh-snapshot SUM
  guard + conditional INSERT), the same non-interactive-transaction mechanism
  `payroll-repo.ts` already uses. `sql.transaction`'s non-interactive nature is
  compatible: statement 2's SQL text does not depend on statement 1's returned
  data, only on executing after it within the same lock-holding transaction.
  Empirically verified against real Postgres 16 (Docker) — see Risks for the
  methodology and 3/3 results.
