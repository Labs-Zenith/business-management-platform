# Archive Report: expenses-dashboard-split

**Change**: expenses-dashboard-split
**Archived**: 2026-07-12
**Status**: COMPLETE (PASS)
**Mode**: hybrid (filesystem + Engram)

---

## Executive Summary

Expenses Tracking + Dashboard Ingresos/Egresos Split (Phase 2, plan point 5) has been fully implemented, verified, and archived. All 3 chained PRs are committed to main (2c274b9, ca4522d, 73661ea). The change adds a generic `expenses` entity mirroring the Invoice/Payment port+repo+migration+API pattern, with a reusable `createExpense` service function so a future Nomina payroll module can insert `category: 'nomina'` rows programmatically, and splits the dashboard into Ingresos (unchanged) / Egresos tabs using the repo's first `Tabs` primitive (`@base-ui/react`). Verification passed cleanly with no CRITICAL or WARNING issues. Ready for the next SDD change.

---

## What Shipped

### PR 1: 2c274b9 — Backend/Data Layer
- Migration `1700000002000_add_expenses.sql` (fake-epoch `+1e9` convention): `expenses` table (`id`, `business_id` FK, `category TEXT CHECK IN ('nomina','otro')`, `expense_date`, `description`, `amount INTEGER`, `notes`, timestamps) + `idx_expenses_business`; destructive `DROP TABLE CASCADE` Down.
- Ports: `ExpenseCategory`, `ExpenseInput` (repo-facing, no server-derived fields — decision: single type replaces the proposal's `ExpenseCreate`/`ExpensePersist` split since nothing is computed), `Expense`, `ExpenseListQuery`, `ExpenseRepository` (list/getById/create).
- Dual-backend repos: `lib/mock/expense-repo.ts` (mirrors `payment-repo.ts` minus `withRefs`/`withLock`/`simulateLatency`) + `lib/db/expense-repo.ts` (`ExpenseRow` mapper, JS-side filter/sort, `INSERT ... RETURNING *`); wired into `repositories.ts` via `isDbConfigured` ternary.
- `lib/mock/store.ts`: `expenses` Map/array wired through serialize/clear/create/hydrate; `hydrateStore` uses `data.expenses ?? []` defensively for backward-compat with pre-change cookies (Risk R4 mitigation).
- Fixtures: `ExpenseFixture` type, `expenseId(n)` helper (id prefix `60000000-`), seeded via `seedFixtures`, excluded from `seedMinimal` (matches invoices/payments/customers convention).
- Services: `expense-service.ts` (`listExpenses`/`getExpense`/`createExpense` — `businessId` always from session; internal zod validation added during review-fix pass so direct non-route callers, e.g. future Nomina, still get validation) + `expense-dashboard-service.ts` (`getExpensesTotalThisMonth`/`getExpensesByCategory`/`getRecentExpenses`/`getExpensesSummary`, `ALL_ROWS`-fetch + JS-aggregation + `Promise.all`, mirroring `dashboard-service.ts`'s split-function style for independent Suspense).
- `lib/schemas/expense.ts` strict zod schema (category enum, positive integer amount capped at Postgres `INTEGER` max — `MAX_AMOUNT_COP_CENTS`, added during review) + `app/api/expenses/route.ts` GET+POST mirroring `invoices/route.ts`.
- Tests: repo (mock+db), service, schema/route — all business-scoped, cross-business isolation covered.

### PR 2: ca4522d — Tabs Primitive + Dashboard Split
- `components/ui/tabs.tsx` (first Tabs use in this repo): wraps `@base-ui/react/tabs` `Root`/`List`/`Tab`/`Panel`; verified against `node_modules/@base-ui/react/tabs/**/*.d.ts` that the real selected-state attribute is `data-active` (not `data-selected` as the design draft assumed) — `tabs.tsx` uses `data-[active]:*` classes.
- `app/(dashboard)/dashboard/page.tsx`: wrapped in `<Tabs defaultValue="ingresos">` + `<TabsList>`; existing Ingresos subtree moved verbatim into `<TabsPanel value="ingresos" keepMounted>` (unchanged behavior); new `<TabsPanel value="egresos" keepMounted>` added. Page stays a plain Server Component — Egresos Server Components are passed as children into the client Tabs shell, never imported into `tabs.tsx` itself, preserving independent per-section Suspense streaming. **`keepMounted` on both panels is the single load-bearing prop** — it makes both tabs eager-fetch and stream on initial load, and tab-switching purely CSS-based (no refetch, no lost streamed state).
- Egresos display components: `expense-kpi-cards.tsx`, `expenses-by-category.tsx` (two-row Nómina/Otro breakdown, no new chart type), `recent-expenses.tsx` (Table with empty-state row "Sin gastos registrados."), each a standalone async Server Component + Skeleton in its own `<Suspense>`.
- Tests: `10.7`'s dedicated-Tabs-test intent was implemented as `app/(dashboard)/dashboard/page.test.tsx` instead of a standalone `tabs.test.tsx`, following the established codebase convention that no `components/ui/*` primitive has its own test file — verified through the real consumer with actual (unmocked) Tabs components, proving both panels' content is simultaneously present in the DOM and that switching tabs does not unmount the Ingresos content.
- Verification gate run for this PR's slice: typecheck/lint/test (365/365, 60 files)/build all green.

### PR 3: 73661ea — "Crear Gasto" Dialog
- `expense-form-schema.ts` (client-side pesos-based schema, distinct from the server's cents-based `lib/schemas/expense.ts`), `expense-form-dialog-content.tsx` (react-hook-form + zodResolver; category/description/amount/date/notes fields; pesos→cents conversion at submit; `router.refresh()` on success), `expense-form-dialog.tsx` (thin lazy `dynamic(..., { ssr:false })` wrapper mirroring `customer-form-dialog.tsx`), wired as a trigger button into the Egresos `TabsPanel`.
- Explicitly-verified correctness fixes (per user request, confirmed present in final code):
  - `todayIsoDate()` uses local `getFullYear()/getMonth()/getDate()`, NOT `toISOString()` — avoids the UTC-vs-local date-shift bug. Covered by a test pinning a UTC timestamp near a day boundary.
  - Cents conversion normalizes via `Math.round(Number((values.amount * 100).toFixed(2)))` instead of a raw `Math.round(value * 100)`, avoiding float-precision errors (verified with `it.each` cases 1.005→101, 8.575→858, 5.015→502).
  - Single shared `CATEGORY_META`/`getCategoryLabel()` source in `expense-dashboard-service.ts` — no duplicated "Nomina"/"Nómina" label maps anywhere in the codebase.
- Tests: `expense-form-dialog-content.test.tsx` (12 tests — valid submission, client-side validation blocking, server error message surfacing).
- Full aggregate verification gate (all 3 PRs): typecheck/lint PASS, 384/384 tests across 64 files PASS, `next build` PASS.

---

## Verification Verdict

**Status**: PASS (no CRITICAL, no WARNING)

### Test Results
| Command | Result | Details |
|---------|--------|---------|
| `npm run typecheck` | PASS | `tsc --noEmit` clean |
| `npm run lint` | PASS | eslint clean |
| `npm run test` | PASS | 384/384 passed, 64 files |
| `npm run build` | PASS | `next build` Turbopack, only a pre-existing unrelated "middleware deprecated" warning |

### Completeness
- Tasks: 11 phases, ~30 leaf items, all `[x]` on the persisted `tasks.md` (an earlier Engram snapshot of the tasks observation showed Phase 9 unchecked — that was a stale mid-flight capture from before PR3 was recorded; the authoritative filesystem `tasks.md` and the verify report both confirm all tasks complete and all 3 PRs committed).
- Spec compliance: 12/12 scenarios across both domains (`expense-tracking` 8 requirements, `dashboard` delta 4 requirements) traced to real, tested code — COMPLIANT.
- 5 explicit user-requested verification points (local-time date default, `.toFixed(2)` cents rounding, internal `createExpense` zod validation, `keepMounted` on both panels, shared category-label source) all independently CONFIRMED in the verify pass.

### Informational Note (Not a Blocker)
The SAME two bug classes fixed in this change's own "Crear gasto" form — (1) UTC-based default date via `toISOString().slice(0,10)` instead of local-time getters, and (2) raw `Math.round(value * 100)` float-rounding on cents conversion instead of a `.toFixed(2)`-normalized round — **still exist unfixed** in two pre-existing forms outside this change's scope:
- `components/domain/invoices/invoice-form-content.tsx` (line 40: `toISOString`; lines 72/88: raw `Math.round(...*100)`)
- `components/domain/payments/payment-form-dialog-content.tsx` (line 47: `toISOString`; line 76: raw `Math.round(...*100)`)

This was confirmed via grep during verification and was explicitly called out as intentionally out of scope in the PR3 commit message. **Recommended as a separate follow-up change** (not part of this archive) to fix both bug classes in the invoice and payment forms for consistency with the newly-hardened expense form.

---

## Artifact Traceability (Engram Observation IDs)

| Artifact | ID | Status |
|----------|----|----|
| Proposal | 40 | archived |
| Spec | 41 | archived |
| Design | 42 | archived |
| Tasks | 43 | archived |
| Verify Report | 48 | archived |

All artifacts persist in Engram for audit trail; this archive report is saved as `sdd/expenses-dashboard-split/archive-report` (topic_key-based upsert).

---

## Specs Synced to Main

### New Specs (Created)
- `openspec/specs/expense-tracking/spec.md` — new capability: business-scoped expense schema, category constraint, positive-integer-amount validation, reusable `createExpense`, list/create endpoint, "Crear gasto" manual entry form, business_id scoping (8 requirements copied directly from the change's full delta spec, since no prior main spec existed for this domain).

### Modified Specs (Delta Merged)
- `openspec/specs/dashboard/spec.md` — `Dashboard Screen Content and Actions` requirement replaced (Ingresos content preserved verbatim + Egresos tab content/actions added); 3 new requirements appended (`Egresos Tab Business-Scoped Aggregates`, `Egresos Independent Suspense Streaming`, `Egresos Empty State`). The three untouched Ingresos-only requirements (`Business-Scoped Summary Endpoint`, `Computed Not Stale Aggregates`, `business_id Scoping (RLS-Equivalent)`) were preserved unchanged, exactly as the delta spec intended (they were not repeated in the delta per convention).

---

## SDD Cycle Complete

- **Proposal** (intent, scope, approach): #40
- **Spec** (requirements, scenarios): #41
- **Design** (technical approach, file changes): #42
- **Tasks** (work units, phases, verification gate): #43
- **Apply** (3 chained PRs, full implementation): 2c274b9, ca4522d, 73661ea
- **Verify** (test execution, compliance, security): #48 (PASS)
- **Archive** (specs synced, artifacts archived, this report): 2026-07-12-expenses-dashboard-split

---

## Next Steps

1. **Immediate**: None — archive complete. Change closed.
2. **Recommended follow-up (separate change)**: Fix the same UTC-date-default + float-rounding-cents bug classes in `invoice-form-content.tsx` and `payment-form-dialog-content.tsx`, matching the hardening already applied to the expense form in this change.
3. **Phase 3 (Nomina)**: can now call `createExpense(session, { category: "nomina", ... })` directly to auto-insert payroll expense rows, per this change's design intent; role-gating for the Egresos tab (if desired) is also deferred to that phase.

---

**Archive Date**: 2026-07-12
**Archived By**: sdd-archive executor
**Final Status**: READY FOR NEXT CHANGE
