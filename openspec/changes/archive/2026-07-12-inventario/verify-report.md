## Verification Report: inventario (Stock Tracking)

**Verdict: PASS WITH WARNINGS**

### Build/test evidence (run by the orchestrator, confirmed directly, not re-executed in full by this verify pass)
- `npm run typecheck` — clean (orchestrator-confirmed).
- `npm run lint` — clean (orchestrator-confirmed).
- `npx vitest run` (default order) — 666/666 passed, 94 files (orchestrator-confirmed; independently spot-re-run during this verify pass and reconfirmed 666/666 in 17s).
- `npx vitest run --no-file-parallelism --sequence.shuffle --sequence.seed=11` — 666/666 passed, confirming test-order independence (orchestrator-confirmed only; not re-run here).
- `npm run build` — succeeded; `/inventario`, `/api/products`, `/api/products/[id]`, `/api/inventory-movements` all present as dynamic routes (orchestrator-confirmed).

### Artifacts read
- `openspec/changes/inventario/proposal.md`, `design.md`, `specs/inventory-tracking/spec.md`, `tasks.md` (filesystem, authoritative).
- Engram `sdd/inventario/spec` (#66), `sdd/inventario/tasks` (#68), `sdd/inventario/apply-progress` (#71).

### Spec-to-code traceability (all 11 requirements traced)
1. Products business-scoped/editable — `lib/mock/product-repo.ts`, `lib/db/product-repo.ts` (`update` merges editable fields, no delete op exists).
2. SKU optional free text, no uniqueness — `lib/schemas/product.ts` (`sku` nullable/optional, no `.refine` uniqueness check; DB has no UNIQUE constraint per migration).
3. Movements business-scoped/append-only — `lib/mock/inventory-repo.ts` / `lib/db/inventory-repo.ts` expose only `list`/`getById`/`create`, no update/delete.
4. Positive integer quantity — `lib/schemas/inventory-movement.ts`: `z.number().int().positive().max(...)`.
5. Computed quantity/value never stored — migration has no quantity/value column; both repos derive via `computeProductStock`.
6. Floor-at-zero atomic guard — verified in depth, see below (item of highest scrutiny).
7. Per-product low-stock flag — `computeProductStock`: `isLowStock = currentQuantity < product.minStockThreshold`, applied per-product independently (confirmed via `lib/services/inventory-stock.ts` and both repos' per-product filtering before calling it).
8. Movement note optional — schema `note: z.string()...nullable().optional()`.
9. Movement UI active-products-only — `app/(dashboard)/inventario/page.tsx` computes `activeProducts` via `.filter(p => p.active)` before passing to `MovementFormDialog`.
10. No role gating — confirmed across page, all 3 API routes, and nav item (see below).
11. business_id scoping — every repo method filters/validates against `businessId` param resolved from session (services pass `session.businessId`); route/service tests assert cross-business isolation.

### Item 3 — Floor-at-zero guard: CONFIRMED CORRECT, matches design.md's adopted fix
Read `lib/db/inventory-repo.ts` `create()` in full. It IS the corrected **two-statement `sql.transaction([...])`** approach:
- Statement 1: `SELECT id FROM products WHERE id = ... AND business_id = ... FOR UPDATE` — acquires and holds the row lock for the whole transaction, used only to distinguish NOT_FOUND from a reject.
- Statement 2: a separate `WITH bal AS (...) INSERT ... SELECT ... WHERE type='in' OR quantity <= bal.current_qty RETURNING *` — fresh READ COMMITTED snapshot SUM guard + conditional insert, run AFTER statement 1 already holds the lock.
- The file's doc comment explicitly documents why the original single-statement `FOR UPDATE`-in-CTE was empirically disproven (EvalPlanQual does not re-check a correlated subquery over a child table on lock-wait resume; reproduced -4 overdraw 3/3 against real Postgres 16) and why the two-statement split closes the race (verified 1/2 succeeds, zero mutation on reject, 3/3 against real Postgres 16 Docker).
- This is genuinely the corrected design, not just an assertion — the SQL structure was read directly and matches design.md's "Adopted fix" section verbatim.

**WARNING (documentation inconsistency, not a functional bug)**: `tasks.md` task 2.4's checkbox text describes the OPPOSITE outcome — it says "**Verified**: kept the FOR UPDATE-in-CTE approach ... No fallback needed; design.md's Open Question is resolved, not left open," describing the original single-statement CTE as the final kept approach. This directly contradicts both design.md's own "Adopted fix"/Open Questions sections and the actual committed code in `lib/db/inventory-repo.ts`, which implement the two-statement fix. The functional code and tests are correct and verified; only task 2.4's narrative text is stale/wrong, likely left over from an earlier apply-session note before the correctness fix was made. Recommend correcting task 2.4's text before or shortly after archive so a future reader doesn't get misled about which approach is live.

**Resolution (post-verify, pre-archive)**: task 2.4's text was corrected in commit `72d7efb` to accurately describe the two-statement fix as the final, verified implementation. Confirmed present in the archived `tasks.md` in this folder.

### Item 4 — Shared `computeProductStock()`: CONFIRMED, no duplicated math
Both `lib/mock/product-repo.ts` and `lib/db/product-repo.ts` import and call `computeProductStock` from `lib/services/inventory-stock.ts` (a pure function: `currentQuantity` reduce, `totalValue = currentQuantity * unitCost`, `isLowStock = currentQuantity < minStockThreshold`). Each repo does its own movement-filtering/grouping (Map iteration vs. business-wide fetch grouped in JS) before calling the shared function — filtering is repo-specific per the file's own doc comment, but the math itself is not reimplemented.

### Item 5 — Zero-mutation proof in tests: CONFIRMED
- Mock (`lib/mock/inventory-repo.test.ts` lines 81-96): captures `movementCountBefore = store.inventoryMovements.size` before the rejected call, asserts `rejects.toMatchObject({ code: "VALIDATION_ERROR" })`, then directly asserts `store.inventoryMovements.size` is unchanged AND that `currentQuantity` is unchanged via a fresh `productRepo.getById` read — proves store-level zero mutation, not just an error response.
- Postgres (`lib/db/inventory-repo.test.ts` line 111 test): mocks `sql.transaction` to resolve `[[{ id: PRODUCT_ID }], []]` (lock succeeds, but statement 2's `RETURNING` is empty) and asserts `VALIDATION_ERROR` is thrown (not `NOT_FOUND`), proving the code path correctly distinguishes "product found but insert guard rejected" from "product not found," which is the zero-mutation signal for this mocked-driver style of unit test (the real-Postgres zero-mutation proof lives in the empirical Docker verification documented in the file's doc comment and design.md's Risks section, appropriately not repeatable as a fast unit test).

### Item 6 — `resetStore()` in-place mutation: CONFIRMED
`lib/mock/store.ts`'s `resetStore()`: `clearStore(store); seedFixtures(store); return store;` — clears and re-seeds the existing Maps on the same object reference (`store`), never reassigning `globalWithMockStore.__mockStore`. The function's own doc comment explains why: every mock repo is a module-level singleton constructed once at import time closing over that exact object; reassigning the pointer would leave already-constructed repos observing stale state. This was the subject of the standalone fix commit `37acfb8` ("fix: make resetStore() actually reset state observed by repos"), confirmed present and correct in the current code, not reverted.

### Item 7 — No role/capability gating on Inventario: CONFIRMED
- `app/(dashboard)/inventario/page.tsx`: only `requireSessionOrRedirect()`, no `requireCapability`/`requireCapabilityOrNotFound` call anywhere in the file.
- `app/api/products/route.ts`, `app/api/products/[id]/route.ts`, `app/api/inventory-movements/route.ts`: all handlers use `requireSession()` only; doc comments in each explicitly reference the spec's "No Role Gating on Inventory" requirement.
- `components/layout/nav-items.ts`: `{ href: "/inventario", label: "Inventario", icon: Package }` — no `capability` field at all (functionally equivalent to `capability: undefined`; task 6.1's text describes an explicit `capability: undefined` field but the actual code just omits the key — cosmetic difference only, `!item.capability` short-circuit behaves identically either way; not flagged as a real issue).
- Dialog components (`product-form-dialog-content.tsx`, `movement-form-dialog-content.tsx`) contain no capability checks.

### Tasks.md cross-check against `git log` and file contents
- Phase 1-4 (PR1, backend) — all `[x]`, matches commit `00de3f4` (28 files, migration/ports/schemas/repos/services/tests all present as described).
- Phase 5 (PR2, routes) — all `[x]`, matches commit `9cb448e`.
- Phase 6-8 (PR3, page/dialogs/tests/verification gate) — all `[x]`, matches commit `cb66742`; working tree is clean (`git status --short` empty), confirming PR3 is fully committed, not left uncommitted as an earlier apply-progress note suggested mid-session.
- Standalone fix `37acfb8` (`resetStore()`) is not itself an inventario task-list item (correctly so — it's a cross-cutting test-infra fix, not inventario-specific), but it was discovered during this change's review and is directly load-bearing for the shuffled-seed test-order-independence proof; confirmed present and correct.
- One inaccuracy found: task 2.4's descriptive text (see Item 3 above) does not match the final implementation, despite being checked `[x]`. The checkbox completion status itself is accurate (the work IS done); only the prose describing *which* approach was kept is stale/wrong. **Corrected in commit `72d7efb`.**

### Issues

**CRITICAL**: None.

**WARNING**:
1. `openspec/changes/inventario/tasks.md` task 2.4's narrative text states the single-statement `FOR UPDATE`-in-CTE approach was kept as final, contradicting both `design.md`'s own Adopted-fix/Open-Questions sections and the actual committed code (`lib/db/inventory-repo.ts`), which correctly implement the two-statement fix. Purely a documentation-lag issue — code and tests are correct — but should be corrected so the artifact trail doesn't mislead a future reader into believing the disproven approach is live. **RESOLVED**: corrected in commit `72d7efb`, prior to archive.

**SUGGESTION**:
1. Nav item task description (6.1) mentions an explicit `capability: undefined` field; actual code omits the key entirely. Functionally identical, purely cosmetic; no action needed.

### Overall
All 11 spec requirements trace to real, tested code. All tasks.md checkboxes match actual committed file contents and git history (3 chained PRs all committed: `00de3f4`, `9cb448e`, `cb66742`, plus standalone `37acfb8`). The safety-critical floor-at-zero concurrency guard's final Postgres implementation is genuinely the corrected two-statement design, not the disproven single-statement CTE — confirmed by direct code reading, not by trusting prior claims. The only real gap was a stale/self-contradictory documentation note in tasks.md task 2.4, which did not affect functional correctness and has since been corrected (commit `72d7efb`) prior to archive.
