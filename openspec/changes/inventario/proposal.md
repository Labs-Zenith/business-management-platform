# Proposal: Inventario (stock tracking)

## Intent

Fase 2 plan point 7. Businesses have no way to track product stock. Add a products catalog plus an append-only movement ledger (in/out) so any authenticated user can see current quantity, inventory value, and low-stock alerts. Current quantity is **derived** from the ledger (never a stored column), mirroring how `invoices.balance`/`status` are computed from `payments` — eliminating a whole class of drift bugs.

## Scope

### In Scope
- Migration `1700000004000_add_inventory.sql`: `products` (no quantity column) + `inventory_movements`.
- Ports: `Product` (+ computed `currentQuantity`/`totalValue`), `ProductCreate`/`ProductUpdate` (editable), `InventoryMovement`/`InventoryMovementCreate` (append-only), `ProductRepository`, `InventoryMovementRepository`.
- Dual-backend repos (mock + Postgres) + `repositories.ts` wiring; mock `store.ts` Maps + fixtures (`?? []` hydration, excluded from `seedMinimal`).
- `product-service.ts` (CRUD) + `inventory-service.ts` (`recordMovement()` — atomic guarded create).
- Per-product low-stock flag: computed quantity `< min_stock_threshold`.
- Routes: `/api/products` (list/create), `/api/products/[id]` (PATCH), `/api/inventory-movements` (list/create) — `requireSession()` only, no capability gate.
- Page `/inventario`: Tabs Productos/Movimientos (mirror Nomina, `MAX_DISPLAYED_ROWS = 50`), plain nav item.

### Out of Scope
- Purchase orders, suppliers, variants/categories, stock valuation methods (FIFO/LIFO), barcode scanning, real pagination, role gating.

## Capabilities

### New Capabilities
- `inventory-tracking`: products catalog, computed stock quantity/value from an append-only movement ledger, floor-at-zero guard on out movements, and per-product low-stock alerts.

### Modified Capabilities
- None. Fully independent of prior Fase 2 phases (roles/expenses/nomina); no existing spec delta.

## Approach

- **Computed quantity**: `ProductRepository.list`/`getById` SUM movements (in − out) per product at read time, structurally mirroring `invoice-repo.ts`'s `withFinance()`.
- **Floor-at-zero guard**: `InventoryMovementRepository.create` for `type='out'` rejects `quantity > currentComputedQuantity` with **zero mutation**, mirroring `payment-repo.ts`'s locked read-check-write (`withLock(productId)` in mock; single guarded CTE/transaction in Postgres) — NOT invoice-numbering's blind increment.
- Monetary fields integer minor units; every query scoped by `business_id`.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `migrations/1700000004000_add_inventory.sql` | New | Two tables |
| `lib/services/ports.ts` | Modified | 5 types + 2 interfaces |
| `lib/{db,mock}/*` + `repositories.ts` + `store.ts` + fixtures | Modified/New | Dual repos, wiring, seed |
| `lib/services/{product,inventory}-service.ts` | New | CRUD + guarded movement |
| `app/api/products/**`, `app/api/inventory-movements/**` | New | Routes |
| `app/(dashboard)/inventario/page.tsx`, `nav-items.ts` | New/Modified | Page + nav |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Per-product SUM on every list render | Med | Accepted cost class — same as `invoices.list()` payment aggregation; not a new risk category |
| Concurrent out movements over-draw stock | Low | Locked read-check-write (mock) / guarded CTE (Postgres), zero mutation on reject |
| Multi-tenant leak | Low | All queries scoped by `business_id`; getById cross-business → `null` |

## Rollback Plan

Revert the branch; run `migrate down` (drops `inventory_movements` then `products`). No other tables touched — isolated, additive change.

## Dependencies

- None external. Builds on existing ledger/dual-backend/multi-tenant conventions.

## Success Criteria

- [ ] Recording in/out movements changes computed quantity correctly; out beyond stock is rejected with no mutation.
- [ ] Products report shows quantity, total value, and low-stock flag per product's own threshold.
- [ ] Postgres and mock backends produce identical behavior; `npm run test` and `npm run build` pass.
