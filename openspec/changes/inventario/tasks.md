# Tasks: Inventario (Stock Tracking)

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~1550-1750 total (PR1 ~850-950: migration ~35, ports ~60, schemas ~40, mock+db product-repo w/ SUM-derived stock ~100, mock+db inventory-repo w/ atomic guard ~120, repositories/store/fixtures wiring ~70, product+inventory services ~70, tests ~350-400 / PR2 ~250-330: 3 API routes ~130, route tests ~150-200 / PR3 ~450-500: nav item ~5, page ~60, product dialog ~120, movement dialog ~150, tests ~150) |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR 1 (schema + ports + dual-backend repos incl. atomicity verification + services, fully tested) → PR 2 (API routes) → PR 3 (page + nav + dialogs) |
| Delivery strategy | ask-on-risk (default; not overridden this session) |
| Chain strategy | feature-branch-chain (recommended, matching `nomina-payroll`/`expenses-dashboard-split`'s 3-PR precedent; ask user to confirm before apply) |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: feature-branch-chain
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Migration + ports + zod schemas + dual-backend `product-repo`/`inventory-repo` (inventory-repo owns the floor-at-zero atomic guard — `withLock` mock / CTE+`FOR UPDATE` Postgres, with the Neon-driver verification task) + `repositories.ts`/`store.ts`/fixtures wiring + `product-service`/`inventory-service`, fully unit-tested (mock + db, both entities) | PR 1 | Base = feature/tracker branch. Self-contained backend slice; no UI, no gating; both backends independently testable. Unlike Nomina, this change has NO capability-gating infra — smaller overall footprint. If a single reviewer pass would exceed ~500 lines, split further into 1a (migration+ports+schemas+repos+store/fixtures) / 1b (services+tests). |
| 2 | `app/api/products/route.ts`, `app/api/products/[id]/route.ts`, `app/api/inventory-movements/route.ts` — `requireSession()` only, no `requireCapability` (unlike Nomina's PR2, there is no gating infra to build here) | PR 2 | Base = PR 1 branch. Depends on PR 1's services. Deliberately thin/small PR — do not pad it with UI; keep the diff reviewable and focused on route-level auth (`requireSession`, `checkOrigin` on mutations) and validation. |
| 3 | `app/(dashboard)/inventario/page.tsx` (Tabs Productos/Movimientos, `keepMounted`) + plain `nav-items.ts` entry (no `capability` tag) + product create/edit dialog + "Registrar movimiento" dialog (active-products-only select) | PR 3 | Base = PR 2 branch. Depends on PR 2's routes existing to POST/PATCH against, and PR 1's service/type exports. |

## Phase 1: Migration, Ports & Schemas (Foundation)

- [x] 1.1 Create `migrations/1700000004000_add_inventory.sql`. Up: `products` (`id UUID PK`, `business_id UUID NOT NULL REFERENCES businesses(id)`, `name TEXT NOT NULL`, `sku TEXT` nullable, `unit_cost INTEGER NOT NULL`, `min_stock_threshold INTEGER NOT NULL DEFAULT 0`, `active BOOLEAN NOT NULL DEFAULT true`, `created_at`/`updated_at TIMESTAMPTZ DEFAULT now()` — NO quantity/value column) + index on `business_id`; `inventory_movements` (`id UUID PK`, `business_id UUID NOT NULL REFERENCES businesses(id)`, `product_id UUID NOT NULL REFERENCES products(id)`, `type TEXT NOT NULL CHECK (type IN ('in','out'))`, `quantity INTEGER NOT NULL CHECK (quantity > 0)`, `note TEXT` nullable, `created_at TIMESTAMPTZ DEFAULT now()` — append-only, no `updated_at`) + indexes on `business_id` and `product_id`. Down: `DROP TABLE IF EXISTS inventory_movements CASCADE` then `products CASCADE` (FK-dependent order).
- [x] 1.2 `lib/services/ports.ts`: add `Product`, `ProductWithStock` (`Product & { currentQuantity; totalValue; isLowStock }`), `ProductCreate`, `ProductUpdate`, `ProductListQuery`, `ProductRepository` (list/getById/create/update); `MovementType`, `InventoryMovement`, `InventoryMovementWithProduct`, `InventoryMovementCreate`, `InventoryMovementListQuery`, `InventoryMovementRepository` (list/getById/create — `create` documented as atomic floor-at-zero), per design.md's interfaces section verbatim.
- [x] 1.3 Create `lib/schemas/product.ts`: `.strict()` `productCreateSchema` (name, optional sku, unitCost positive integer, optional minStockThreshold non-negative integer) and `productUpdateSchema` (all fields partial + optional active).
- [x] 1.4 Create `lib/schemas/inventory-movement.ts`: `.strict()` `inventoryMovementCreateSchema` (productId, type enum `in`/`out`, quantity positive integer, optional note).

## Phase 2: Repositories & Store

- [x] 2.1 Create `lib/mock/product-repo.ts`: Employee-style mock repo (list/getById/create/update, business-scoped, cross-business lookups return `null`/excluded from list) whose `list`/`getById` compute `currentQuantity`/`totalValue`/`isLowStock` by reducing `store.inventoryMovements` per product (mirrors `invoice-repo.ts`'s `withFinance` shape).
- [x] 2.2 Create `lib/db/product-repo.ts`: Postgres repo mirroring the mock's contract via parameterized SQL, computing the same derived fields (fetch all business movements once, group in JS — mirrors `invoice-repo.list`'s payment aggregation).
- [x] 2.3 Create `lib/mock/inventory-repo.ts`: `list`/`getById` business-scoped (joins product name for `InventoryMovementWithProduct`); `create` uses `withLock(productId)` — recompute current quantity from movements, `simulateLatency()` to create a real read-write gap, reject `type='out'` where `quantity > currentQuantity` with `ApiError("VALIDATION_ERROR", ...)` and zero mutation, mirroring `payment-repo.ts`'s mock guard exactly.
- [x] 2.4 Create `lib/db/inventory-repo.ts`: friendly `NOT_FOUND` pre-check, then the atomic floor-at-zero guard. **Superseded history**: the original single-statement `FOR UPDATE`-in-CTE approach (locking the product row and a `SUM`-derived balance subquery in one statement) was initially believed sufficient based on documentation review, but was later **empirically proven broken** against a real Postgres 16 container — two concurrent `out` movements both succeeded, driving computed stock negative, because Postgres's EvalPlanQual only re-checks the locked row's own columns on lock-wait resume, not a correlated subquery over a different table in the same statement. **Final, verified implementation**: a genuine two-statement `sql.transaction([...])` — statement 1 acquires and holds the `FOR UPDATE` lock on the product row; statement 2 (the `SUM`-guarded `INSERT`) runs second, within the same transaction, taking a fresh snapshot only after the lock resolves. Verified 3/3 against a real Postgres container reproducing both the old bug and the new fix's correctness (see the file's own doc comment and `design.md`'s Risks section for the full methodology).
- [x] 2.5 `lib/services/repositories.ts`: wire `products: isDbConfigured ? dbProductRepo : mockProductRepo` and `inventory: isDbConfigured ? dbInventoryRepo : mockInventoryRepo`.
- [x] 2.6 `lib/mock/store.ts`: add `products: Map<string, Product>` and `inventoryMovements: Map<string, InventoryMovement>` to `MockStore`/`SerializedStore`; wire into `serializeStore`/`clearStore`/`createEmptyStore`; `hydrateStore` uses `?? []` defensive fallback for both (cookie backward-compat, matching Nomina's precedent).
- [x] 2.7 `lib/mock/fixtures/data.ts`: add `ProductFixture`/`InventoryMovementFixture` types, id-block helpers (next unused prefix), and demo product fixtures (at least one active low-stock product, one inactive product) + seed movement history.
- [x] 2.8 `lib/mock/fixtures/index.ts`: `seedFixtures` loops the new fixtures into store maps scoped to `BUSINESS_ID`; confirm `seedMinimal` does **NOT** seed products/movements (cookie-size constraint, matching employees/payroll).

## Phase 3: Services

- [x] 3.1 Create `lib/services/product-service.ts`: `listProducts`, `getProduct` (throws `ApiError("NOT_FOUND")`), `createProduct`, `updateProduct` (forwards name/sku/unitCost/minStockThreshold/active) — line-for-line analog of `employee-service.ts`.
- [x] 3.2 Create `lib/services/inventory-service.ts`: `listMovements` + `recordMovement(session, data)` → thin pass-through to `repositories.inventory.create(session.businessId, data)`, mirroring `payment-service.ts`'s honesty (no service-layer re-derivation of the guard).

## Phase 4: PR1 Tests (Backend Layer)

- [x] 4.1 `lib/mock/product-repo.test.ts` + `lib/db/product-repo.test.ts`: business-scoped isolation; computed `currentQuantity`/`totalValue` correctness across a mix of `in`/`out` movements; `isLowStock` flips correctly at the exact per-product `min_stock_threshold` boundary; update applies editable fields, no delete operation exists.
- [x] 4.2 `lib/mock/inventory-repo.test.ts` + `lib/db/inventory-repo.test.ts`: business-scoped isolation; out-movement within stock succeeds; out-movement exceeding stock rejected with `VALIDATION_ERROR` and zero mutation (snapshot store/mocked `sql` before/after, mirroring `payment-service.test.ts`'s partial-state-impossibility style); at least one concurrency-shaped test (`Promise.all` two competing `out` movements under mock `withLock`) proving no over-draw; DB test verifies the CTE's `WHERE` clause structure via the mocked `sql` call.
- [x] 4.3 `lib/services/product-service.test.ts`: CRUD + cross-business `NOT_FOUND`.
- [x] 4.4 `lib/services/inventory-service.test.ts`: `recordMovement` rejects zero/negative/non-integer `quantity` before reaching the repo (`VALIDATION_ERROR`), passes through the repo's floor-at-zero rejection unchanged.
- [x] 4.5 `lib/mock/store.test.ts`: regression — `hydrateStore` on a payload missing `products`/`inventoryMovements` fields does not throw.

## Phase 5: API Routes (PR2)

- [x] 5.1 Create `app/api/products/route.ts`: `GET` (`requireSession()`, pagination, `listProducts`), `POST` (`checkOrigin`, `productCreateSchema.safeParse`, `createProduct`, 201) — no capability gate.
- [x] 5.2 Create `app/api/products/[id]/route.ts`: `PATCH` (`requireSession()`, `checkOrigin`, `productUpdateSchema.safeParse`, `updateProduct`, 404 if missing — no delete verb).
- [x] 5.3 Create `app/api/inventory-movements/route.ts`: `GET` (`requireSession()`, pagination/filters, `listMovements`), `POST` (`checkOrigin`, `inventoryMovementCreateSchema.safeParse`, `recordMovement`, 201).
- [x] 5.4 Tests (`products-routes.test.ts`, `inventory-movements-routes.test.ts`): any authenticated session (no role restriction) succeeds; cross-business isolation; `checkOrigin` enforcement on POST/PATCH; `VALIDATION_ERROR` on bad payloads; the floor-at-zero rejection surfaces as `VALIDATION_ERROR` through the route.

## Phase 6: Inventario Page + Nav + Dialogs (PR3)

- [x] 6.1 `components/layout/nav-items.ts`: add `{ href: "/inventario", label: "Inventario", icon: Package, capability: undefined }` (plain entry, no `capability` tag — visible to all roles via `navItemsForRole`'s `!item.capability` short-circuit).
- [x] 6.2 Create `app/(dashboard)/inventario/page.tsx`: `requireSession()`; `<Tabs>` with `Productos`/`Movimientos` `TabsPanel`s (both `keepMounted`, `MAX_DISPLAYED_ROWS = 50`), mirroring `nomina/page.tsx`'s structure minus any capability check.
- [x] 6.3 Create `components/domain/inventario/product-form-dialog-content.tsx` + `product-form-dialog.tsx` (lazy `dynamic(..., {ssr:false})` wrapper): fields name, sku (optional), unitCost (pesos→cents), minStockThreshold, active toggle (edit-only); POST/PATCH then `router.refresh()`.
- [x] 6.4 Create `components/domain/inventario/movement-form-dialog-content.tsx` + wrapper: fields productId (select, **active products only** via client-side filter mirroring Nomina's `activeEmployees` pattern), type (in/out), quantity, note (optional); POST then `router.refresh()`.
- [x] 6.5 Wire both dialogs into the page's Productos/Movimientos tabs from 6.2.

## Phase 7: PR3 Tests

- [x] 7.1 `app/(dashboard)/inventario/page.test.tsx`: any authenticated session renders both tabs with `keepMounted` content present (no not-found/redirect path, unlike Nomina).
- [x] 7.2 `product-form-dialog-content.test.tsx`: valid submit POSTs/PATCHes cents-converted payload (tricky-decimal `unitCost` value through `pesosToCents`), calls `router.refresh()`; active toggle hidden on create, shown on edit.
- [x] 7.3 `movement-form-dialog-content.test.tsx`: product select offers only active products (inactive excluded); valid submit POSTs correct payload; invalid/zero/negative quantity blocks submission client-side; server-side floor-at-zero rejection surfaces the error message without closing the dialog.

## Phase 8: Verification Gate

- [x] 8.1 `npm run typecheck`
- [x] 8.2 `npm run lint`
- [x] 8.3 `npm run test`
- [x] 8.4 `npm run build`
