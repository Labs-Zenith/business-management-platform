# Proposal: Expenses Tracking + Dashboard Ingresos/Egresos Split

## Intent

The platform tracks only income (invoices/payments). Owners have no view of what the business spends, so the dashboard tells half the story. Phase 2 (plan point 5) adds a generic `expenses` entity and splits the dashboard into **Ingresos** (existing, untouched) and **Egresos** tabs. The expense create path must be a plain reusable function so Phase 3 (Nomina) can insert `category: 'nomina'` rows automatically when payroll is recorded — not only via the UI/API.

## Scope

### In Scope
- New `expenses` table + migration `1700000002000_add_expenses.sql` (mirrors invoices/payments conventions; `TEXT + CHECK` category, integer minor units, `notes` for parity).
- `ports.ts`: `Expense`, `ExpenseCategory = 'nomina' | 'otro'`, `ExpenseCreate`/`ExpensePersist`, `ExpenseListQuery`, `ExpenseRepository` (list/getById/create).
- `lib/mock/expense-repo.ts` + `lib/db/expense-repo.ts` + `repositories.ts` wiring; `store.ts` expenses map + serialize/hydrate; fixtures in `seedFixtures` (excluded from `seedMinimal`, matching invoices/payments/customers).
- `lib/services/expense-service.ts` (reusable `createExpense`/`listExpenses`/`getExpense`) + `lib/services/expense-dashboard-service.ts` (small `Promise.all`-composable aggregations).
- `app/api/expenses/route.ts` (GET list + POST create) + `lib/schemas/expense.ts` zod schema.
- Dashboard split via new `components/ui/tabs.tsx` + Egresos components (total-this-month, by-category, recent list).

### Out of Scope
- Role-gating (both admin/worker see both tabs; `permissions.ts` untouched — that is Phase 3).
- Automatic payroll-driven expense inserts (Phase 3 Nomina — this change only makes the service generically capable).
- Expense edit/delete, category-specific columns (e.g. `employee_id`).

## Capabilities

### New Capabilities
- `expense-tracking`: expenses entity — schema, ports/repos, reusable service, and `/api/expenses` list+create.

### Modified Capabilities
- `dashboard`: add an Egresos tab (expense KPIs/charts/recent list) alongside the unchanged Ingresos content; Ingresos requirements/behavior preserved.

## Approach

Mirror the Invoice/Payment port+repo+migration+API-route pattern exactly (Approach 1 from exploration). `Expense` is closest to `Payment` minus the invoice/customer joins (no `*WithRefs`, no status/balance). `expense-dashboard-service.ts` copies `dashboard-service.ts`'s split small-function + `ALL_ROWS`-fetch + JS-aggregation + `Promise.all` summary style.

**Dashboard page stays a Server Component**: it renders a thin `"use client"` `<Tabs>` shell and passes the Ingresos and Egresos server subtrees as children, so each tab keeps its own per-section `<Suspense>` streaming. **Eager-fetch both tabs on load** (recommended: matches the app's "render everything, let Suspense stream" philosophy and modest MVP data volumes) rather than lazy client-side fetch on tab activation.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `migrations/1700000002000_add_expenses.sql` | New | `expenses` table + `idx_expenses_business`; Down = DROP |
| `lib/services/ports.ts` | Modified | Expense types + `ExpenseRepository` |
| `lib/{mock,db}/expense-repo.ts` | New | Dual-backend repos |
| `lib/services/repositories.ts` | Modified | `expenses` ternary wiring |
| `lib/mock/store.ts`, `fixtures/{data,index}.ts` | Modified | Expenses map + fixtures |
| `lib/services/expense-service.ts`, `expense-dashboard-service.ts` | New | Reusable CRUD + aggregations |
| `lib/schemas/expense.ts`, `app/api/expenses/route.ts` | New | Zod + list/create endpoint |
| `components/ui/tabs.tsx` | New | `shadcn add tabs` on `@base-ui/react` |
| `components/domain/dashboard/expense-*.tsx` | New | Egresos KPI/chart/recent components |
| `app/(dashboard)/dashboard/page.tsx` | Modified | Wrap content in Ingresos/Egresos tabs |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| No Tabs component; base-ui (not Radix) API differs | High | sdd-design/apply must `shadcn add tabs` and verify `@base-ui/react/tabs` API vs `select.tsx` before wiring |
| Client `<Tabs>` wrapper breaks server-side Suspense streaming | Med | Pass server subtrees as children props, not import server comps into client |
| `"nomina"` value tempts premature admin-gating | Med | Add category values only; no `permissions.ts` consumer this phase |
| Migration numbering diverges from manual fake-epoch convention | Low | Use `1700000002000` (+1e9), not `node-pg-migrate create`'s real timestamp |

## Rollback Plan

Revert the PR and run migration Down (`DROP TABLE expenses`). All new code is additive (new files + isolated dashboard-page/ports/store edits); Ingresos and existing invoices/payments paths are untouched, so reverting cannot regress income features.

## Dependencies

- `shadcn add tabs` install (first Tabs use in this repo).
- Exploration artifact `sdd/expenses-dashboard-split/explore` (Engram #39).

## Success Criteria

- [x] Migration creates `expenses` (business-scoped, `category IN ('nomina','otro')`, integer amount).
- [x] `/api/expenses` lists (paginated, category/from/to filters) and creates with session-derived `business_id`; `createExpense` is a standalone reusable function (no route coupling).
- [x] A "Crear gasto" form (category, description, amount, date) exists in the Egresos tab, mirroring the invoice/payment create-form pattern, so `category: 'otro'` expenses are enterable by real users this phase (not API-only).
- [x] Dashboard shows Ingresos (unchanged) + Egresos (total this month, by-category, recent, create-expense action) with independent Suspense streaming.
- [x] Expenses excluded from `seedMinimal`; both mock and Postgres backends pass.

## Proposal question round — resolved

1. **Manual expense entry this phase?** RESOLVED: yes — a "Crear gasto" form ships this phase (category, description, amount, date), matching the invoice/payment create-form pattern, so Egresos has real usable data beyond what Nomina auto-inserts later.
2. **Egresos empty state** for a new business (seedMinimal path has no expenses): what should the tab show? *Assumption (unresolved, low-stakes): same empty/zero-state treatment as existing dashboard sections (zeros + empty lists).*
3. **By-category presentation**: is a simple two-row breakdown (Nómina / Otro totals) enough for MVP, or is a chart expected? *Assumption (unresolved, low-stakes): KPI + lightweight by-category breakdown mirroring existing dashboard components; no new chart type beyond what recharts already provides.*
