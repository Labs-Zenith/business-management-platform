# Archive Report: inventario

**Change**: inventario
**Archived**: 2026-07-12
**Status**: COMPLETE (PASS WITH WARNINGS)
**Mode**: hybrid (filesystem + Engram)

---

## Executive Summary

Inventario (Stock Tracking) — Fase 2 plan point 7 — has been fully implemented, verified, and archived. All 3 chained PRs are committed to main (`00de3f4`, `9cb448e`, `cb66742`), plus two related standalone fixes discovered and committed alongside this change's development: `37acfb8` (`resetStore()` test-infrastructure fix) and `72d7efb` (tasks.md documentation correction). Any authenticated user (no role gate, unlike Nomina) can now maintain a per-business product catalog and record append-only in/out stock movements, with quantity and value always **computed** from the movement ledger — never a stored, driftable column — mirroring how `invoices.balance`/`status` are computed from `payments`. Verification passed with one WARNING (a stale documentation note in `tasks.md`, corrected before archive) and zero CRITICAL issues. Ready for the next SDD change.

---

## What Shipped

### PR 1: `00de3f4` — Backend/Data Layer
- Migration `1700000004000_add_inventory.sql`: `products` (id, business_id, name, sku nullable, unit_cost int minor units, min_stock_threshold int, active bool, timestamps — **no quantity/value column**) + `inventory_movements` (id, business_id, product_id FK, type CHECK IN ('in','out'), quantity int positive, note nullable, created_at — append-only, no `updated_at`) + indexes on `business_id` (both) and `product_id`; down drops movements then products (FK-dependent order).
- Ports (`lib/services/ports.ts`): `Product`, `ProductWithStock` (`Product & { currentQuantity; totalValue; isLowStock }`), `ProductCreate`/`ProductUpdate`, `ProductRepository`; `MovementType`, `InventoryMovement`, `InventoryMovementWithProduct`, `InventoryMovementCreate`, `InventoryMovementRepository` — the computed-view split mirrors `Invoice` vs `InvoiceWithFinance`.
- Dual-backend repos: `lib/{mock,db}/product-repo.ts` (Employee-style editable CRUD, computed stock via shared `computeProductStock()`) and `lib/{mock,db}/inventory-repo.ts` (append-only, owns the atomic floor-at-zero guard).
- `lib/services/inventory-stock.ts`: shared pure function (`currentQuantity` reduce, `totalValue = currentQuantity * unitCost`, `isLowStock = currentQuantity < minStockThreshold`) called by both repos — no duplicated math between mock and Postgres.
- `product-service.ts` (CRUD, line-for-line `employee-service.ts` analog) + `inventory-service.ts` (`recordMovement()` thin honest pass-through, no service-layer re-derivation of the guard).
- Full backend test suite: repo tests (mock+db, both entities, cross-business isolation, computed-field correctness, zero-mutation proof on rejected out-movements), service tests, `store.test.ts` `?? []` hydration regression.

### PR 2: `9cb448e` — API Routes
- `app/api/products/route.ts` (GET list / POST create), `app/api/products/[id]/route.ts` (PATCH only — no delete verb), `app/api/inventory-movements/route.ts` (GET list / POST create) — every handler uses `requireSession()` only, **no `requireCapability` gate**, unlike Nomina; `checkOrigin()` on every mutation.
- Route tests: any authenticated session (no role restriction) succeeds; cross-business isolation; `checkOrigin` enforcement; `VALIDATION_ERROR` on bad payloads; the floor-at-zero rejection surfaces as `VALIDATION_ERROR` through the route.

### PR 3: `cb66742` — Inventario Page + Nav + Dialogs
- `components/layout/nav-items.ts`: plain `{ href: "/inventario", label: "Inventario", icon: Package }` entry — no `capability` tag, visible to every role.
- `app/(dashboard)/inventario/page.tsx`: `requireSessionOrRedirect()` only; `<Tabs>` Productos/Movimientos (both `keepMounted`, `MAX_DISPLAYED_ROWS = 50`), mirroring `nomina/page.tsx`'s structure minus the capability check; computes `activeProducts` filter feeding the movement dialog.
- `components/domain/inventario/product-form-dialog-content.tsx` + lazy wrapper: name/sku/unitCost(pesos→cents)/minStockThreshold/active-toggle (edit-only).
- `components/domain/inventario/movement-form-dialog-content.tsx` + lazy wrapper: product select (**active products only**, mirroring Nomina's `activeEmployees` pattern), type (in/out), quantity, optional note.
- Full PR3 test suite: page gating/rendering, both dialogs' CRUD/validation/double-submit-guard/network-error paths, floor-at-zero server error surfaced without closing the dialog.

### Verification Gate
`npm run typecheck` / `npm run lint` / `npx vitest run` (666/666, 94 files, spot-re-confirmed) / `npx vitest run --no-file-parallelism --sequence.shuffle` (666/666, order-independence) / `npm run build` (all 4 new routes present as dynamic routes) — all green.

---

## The Significant Correctness Story: Floor-at-Zero Concurrency Guard

This change's safety-critical operation is the `out`-movement floor-at-zero guard: an `out` movement that would drive a product's computed quantity below zero must be rejected atomically with **zero mutation**, even under concurrent requests.

**Original design (disproven)**: a single `FOR UPDATE`-in-CTE statement — lock the `products` row with `FOR UPDATE` while a correlated subquery SUMs the *child* `inventory_movements` ledger, all in one SQL statement, then conditionally `INSERT`. This mirrored the shape initially believed sufficient from documentation review alone.

**Empirical disproof**: a reviewer stood up a real Postgres 16 container with this change's exact schema, seeded a product to 10 units, and fired two concurrent `out 7` requests using the exact single-statement CTE. **Both succeeded**, driving the computed stock to -4 — reproduced 3/3 runs. Root cause: Postgres' EvalPlanQual mechanism only re-checks the *locked row's own columns* when a `FOR UPDATE` statement resumes after a lock wait; a correlated subquery over a *different* table (`inventory_movements`) in the *same* statement is **not** re-evaluated with a fresh snapshot. Locking the parent row inside a single statement cannot force a fresh child-aggregate read within that same statement — the second transaction kept the stale SUM it had already computed before blocking.

**Adopted fix (empirically verified)**: a genuine **two-statement `sql.transaction([...])`** at READ COMMITTED, the same non-interactive-transaction mechanism `payroll-repo.ts` already uses:
- **Statement 1**: `SELECT id FROM products WHERE id = ... AND business_id = ... FOR UPDATE` — acquires and holds the row lock for the whole transaction; reads no ledger aggregate; used only to distinguish NOT_FOUND from a reject.
- **Statement 2**: a separate `WITH bal AS (...) INSERT ... SELECT ... WHERE type='in' OR quantity <= bal.current_qty RETURNING *` — because it is a *separate* statement under READ COMMITTED, it takes its own fresh snapshot at statement start, executed only after statement 1's lock is held. A concurrent transaction's statement 1 blocks on the lock until this transaction commits; only then does the competitor's statement 2 run and see the now-committed movement.

**Re-verification**: the same two parallel-`pg`-connection harness that reproduced the -4 overdraw on the old CTE was re-run against the two-statement fix. Result: **exactly one** of two concurrent `out 7` requests succeeded, the other cleanly rejected with zero rows, final computed stock 3 — **3/3 runs**, while the OLD single-statement CTE reproduced the -4 overdraw 3/3 on the identical harness. This is a genuine empirical bug-then-fix cycle against real Postgres, not a documentation-only design decision — confirmed present in the shipped code (`lib/db/inventory-repo.ts`) by direct code reading during verification, matching `design.md`'s "Adopted fix" section verbatim.

This methodology and the full before/after evidence are documented in `lib/db/inventory-repo.ts`'s doc comment and in this archived `design.md`'s Risks/Open Questions sections.

---

## Related Fix: `resetStore()` Test-Infrastructure Correction (`37acfb8`)

During this change's review, a bug was found in `lib/mock/store.ts`'s `resetStore()`: it was reassigning the module-level store pointer (`globalWithMockStore.__mockStore = newStore`) instead of mutating the existing object in place. Because every mock repository is a **module-level singleton constructed once at import time**, closing over one specific store object reference, reassigning the pointer left already-constructed repos observing **stale state** after a reset — silently breaking test isolation for any test relying on `resetStore()` between cases.

**Fix**: `resetStore()` now does `clearStore(store); seedFixtures(store); return store;` — clearing and re-seeding the Maps on the *same* object reference, never reassigning it. This is a cross-cutting fix, not specific to inventario, but it is directly load-bearing for the shuffled-seed test-order-independence proof (`npx vitest run --no-file-parallelism --sequence.shuffle`) that this and future changes rely on to demonstrate tests don't leak state between runs. Confirmed present and correct in the current code as of this archive, not reverted. **This affects the reliability of the whole test suite going forward**, not just inventario.

---

## Verification Verdict

**Status**: PASS WITH WARNINGS (1 WARNING — resolved before archive, 0 CRITICAL, 1 SUGGESTION — no action needed)

### Test Results
| Command | Result | Details |
|---------|--------|---------|
| `npm run typecheck` | PASS | 0 errors |
| `npm run lint` | PASS | 0 errors/warnings |
| `npx vitest run` (default order) | 666/666 PASS | 94 files; independently spot-re-run during verify, reconfirmed in 17s |
| `npx vitest run --no-file-parallelism --sequence.shuffle --sequence.seed=11` | 666/666 PASS | confirms test-order independence |
| `npm run build` | PASS | `/inventario`, `/api/products`, `/api/products/[id]`, `/api/inventory-movements` all present as dynamic routes |

### Completeness
- Tasks: 8 phases, all `[x]` on the persisted `tasks.md`; cross-checked against `git log` (`00de3f4`, `9cb448e`, `cb66742` present in order, working tree clean).
- Spec compliance: all 11 requirements in `inventory-tracking` traced to real, tested code — COMPLIANT.
- Floor-at-zero guard independently re-verified by direct code reading during the verify pass (not by trusting prior claims) — confirmed as the corrected two-statement design.

### Warning — Resolved Before Archive
`tasks.md` task 2.4's narrative text originally described the **disproven** single-statement `FOR UPDATE`-in-CTE approach as the final kept implementation, contradicting both `design.md`'s own Adopted-fix section and the actual committed code. This was a pure documentation-lag issue — the code and tests were always correct — corrected in commit `72d7efb` prior to archive. The archived `tasks.md` in this folder reflects the corrected text.

---

## Artifact Traceability (Engram Observation IDs)

| Artifact | ID | Status |
|----------|----|----|
| Proposal | 65 | archived |
| Spec | 66 | archived |
| Design | 67 | archived |
| Tasks | 68 | archived |
| Verify Report | 74 | archived |

All artifacts persist in Engram for audit trail; this archive report is saved as `sdd/inventario/archive-report` (topic_key-based upsert).

---

## Specs Synced to Main

### New Specs (Created)
- `openspec/specs/inventory-tracking/spec.md` — new capability: business-scoped/editable products, optional-free-text SKU with no uniqueness constraint, business-scoped/append-only inventory movements, positive-integer movement quantity, computed-never-stored quantity/value, the floor-at-zero atomic guard (with an Implementation Note documenting the empirically-verified two-statement fix), per-product low-stock flag, optional movement note, active-products-only movement UI, no role gating, and business_id scoping (11 requirements copied directly from the change's full spec, since no prior main spec existed for this domain).

### Modified Specs (Delta Merged)
- None. This change introduces a fully independent new capability with no overlap with existing main specs (`customers`, `invoices`, `payments`, `receipts`, `payroll-management`, `role-based-navigation`, `role-permissions`, `expense-tracking`, `dashboard`, `business-profile`, `business-switching`, `mock-auth-session`, `api-docs`, `migration-system`).

---

## SDD Cycle Complete

- **Proposal** (intent, scope, approach): #65
- **Spec** (requirements, scenarios): #66
- **Design** (technical approach, file changes, the empirical concurrency-fix story): #67
- **Tasks** (work units, phases, verification gate): #68
- **Apply** (3 chained PRs, full implementation): `00de3f4`, `9cb448e`, `cb66742`
- **Related standalone fixes** (discovered and committed during this change's development): `37acfb8` (`resetStore()` test-infra fix), `72d7efb` (tasks.md documentation correction)
- **Verify** (test execution, compliance, security, concurrency-fix re-verification): #74 (PASS WITH WARNINGS)
- **Archive** (specs synced, artifacts archived, this report): `2026-07-12-inventario`

---

## Next Steps

1. **Immediate**: None — archive complete. Change closed.
2. **Future work enabled by this change**: The computed-ledger pattern (`computeProductStock`, mirroring `invoice-repo.ts#withFinance`) and the two-statement `sql.transaction` floor-at-zero guard pattern are now reusable for any future append-only-ledger-with-atomic-guard feature.
3. **Process note**: the empirical Postgres-container verification methodology used here (reproduce the bug against a real container, then reproduce the fix's correctness against the same harness) is a strong precedent worth reusing for any future safety-critical concurrency guard in this codebase, rather than relying on documentation review alone.

---

**Archive Date**: 2026-07-12
**Archived By**: sdd-archive executor
**Final Status**: READY FOR NEXT CHANGE
