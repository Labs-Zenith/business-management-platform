# Proposal: Nomina (Payroll) — Employees + Payroll Payments

## Intent

Phase 3 (Fase 2, plan point 6) adds payroll. Owners can register employees (name, base salary, active) and record payroll payments, each of which auto-creates a `category:'nomina'` expense so payroll shows on the dashboard's Egresos tab with zero double entry. This is the app's FIRST role-gated feature: only `admin` may see/use Nomina; `worker` must be blocked at every layer. It is also the first real consumer of `canViewPayroll` and the first direct caller of `createExpense`.

## Scope

### In Scope
- Migration `1700000003000_add_payroll.sql`: `employees` (id, business_id, name, base_salary int, active bool, created_at, updated_at) + `payroll_payments` (id, business_id, employee_id FK, amount int, period_type TEXT CHECK IN ('quincenal','mensual'), period_start date, period_end date, payment_date, notes, created_at). Both business-scoped (denormalized `business_id`, matching Payment/Expense).
- Period computation (resolved per user decision): the form lets the admin pick `period_type` ('quincenal' | 'mensual') plus a reference date (defaulting to today); the server derives `period_start`/`period_end` deterministically from that input — mensual: 1st to last day of the reference month; quincenal: 1st-15th (Q1) or 16th-end-of-month (Q2) depending on which half the reference date falls in, correctly handling 28/29/30/31-day months. `period_days` (day count) is NOT stored — it's always derivable as `period_end - period_start + 1`, computed for display only, per this codebase's convention of not persisting derivable values (mirrors `invoices`' status being computed at read time, never stored).
- `ports.ts`: `Employee`/`EmployeeInput`/`EmployeeRepository` (list/getById/create/update — editable, Customer-style); `PayrollPayment`/`PayrollPaymentInput`/`PayrollPaymentRepository` (list/getById/create only — append-only, Payment/Expense-style).
- Dual repos (`lib/{mock,db}/{employee,payroll}-repo.ts`) + `repositories.ts` wiring; `store.ts` maps + `fixtures/{data,index}.ts` (demo employees + payroll history, excluded from `seedMinimal`).
- `employee-service.ts` (Customer-style CRUD) + `payroll-service.ts` whose `createPayrollPayment()` inserts the payroll row AND calls `createExpense(session,{category:'nomina',...})` as one operation.
- Four-layer capability gate: `requireCapability` helpers in `lib/session.ts`; nav filtering in `layout.tsx`; middleware prefixes; page + route checks.
- Routes `app/api/employees/route.ts`, `app/api/employees/[id]/route.ts` (PATCH), `app/api/payroll-payments/route.ts` — all gated. Page `app/(dashboard)/nomina/page.tsx` (Empleados / Pagos tabs, mirroring dashboard's Tabs+keepMounted). Nav item "Nómina" filtered for `worker`.

### Out of Scope
- Void/correct/delete of a payroll payment or its linked expense (accepted MVP constraint, matching Payment/Expense append-only). No compensating-entry flow this phase.
- Employee delete (only active toggle), gross/net/tax math, recurring/scheduled payroll, per-employee payment history drill-down page.
- Gating any other feature or adding new capabilities beyond `viewPayroll`.

## Capabilities

### New Capabilities
- `payroll-management`: employees + payroll_payments entities (schema, ports/repos, services, `/api/employees`+`/api/payroll-payments`, Nomina page) and the payment→expense auto-linkage invariant.
- `role-based-navigation`: role-filtered nav + the reusable `requireCapability` page/route enforcement helpers (first role-gated surface).

### Modified Capabilities
- `role-permissions`: `canViewPayroll` gains its first enforced consumer; add an enforcement requirement (capability checked at page + API layers, `worker` denied) replacing the current "no feature is gated yet" scope note.

## Approach

Mirror existing entity plumbing exactly (Payment/Expense repo+migration+route shape; Customer for the editable employee path). Single "Nomina" page with Empleados/Pagos tabs (exploration Approach 1) concentrates the page-level gate in one place.

**Key design decisions (flagged for sdd-design):**
1. **`period` = TEXT year-month `"2026-07"`.** No payroll precedent in `docs/`; a plain sortable label answers "which pay period" without date-range complexity. Recommended over start/end range.
2. **Payment→expense atomicity.** `createPayrollPayment` must not leave a payroll row without its expense (or vice versa). Mock is trivially atomic in-process. Postgres is the risk: the repo layer should wrap BOTH inserts in ONE transaction. This is the codebase's FIRST multi-statement transaction (existing pattern is single-statement CTEs), so sdd-design must confirm the Neon driver's transaction API and choose: (a) plumb a shared tx client so `createExpense` is reused inside it, or (b) inline the nomina-expense insert into the payroll repo's transaction. Recommend (a) to preserve `createExpense` as the single expense-creation path.
3. **`requireCapability` duality.** Add `requireCapability(session, cap)` → throws `ApiError("FORBIDDEN")` for API routes, and `requireCapabilityOrNotFound(session, cap)` → `notFound()` for pages, in `lib/session.ts` beside the existing session pair (no inline `if` drift across routes).
4. **Worker at `/nomina` → `notFound()` (404), not redirect to `/login`.** The worker is authenticated; a login redirect is confusing and 404 does not confirm the feature exists. Middleware stays presence-only (role never checked there, per convention).

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `migrations/1700000003000_add_payroll.sql` | New | `employees` + `payroll_payments` + indexes; Down = DROP |
| `lib/services/ports.ts` | Modified | Employee/PayrollPayment types + repositories |
| `lib/{mock,db}/{employee,payroll}-repo.ts` | New | Dual-backend repos; DB payroll repo owns the two-insert transaction |
| `lib/services/repositories.ts` | Modified | Wire `employees`/`payroll` ternaries |
| `lib/mock/store.ts`, `fixtures/{data,index}.ts` | Modified | New maps + fixtures (not in `seedMinimal`) |
| `lib/services/{employee,payroll}-service.ts` | New | CRUD + payment→expense linkage |
| `lib/session.ts` | Modified | `requireCapability` / `requireCapabilityOrNotFound` |
| `lib/schemas/{employee,payroll-payment}.ts` | New | Zod `.strict()` schemas |
| `app/api/employees/route.ts`, `[id]/route.ts`, `app/api/payroll-payments/route.ts` | New | Gated list/create/update |
| `app/(dashboard)/nomina/page.tsx` | New | Gated Empleados/Pagos tabs |
| `components/layout/{nav-items,dashboard-sidebar,dashboard-bottom-nav}.tsx`, `layout.tsx` | Modified | Role-filtered nav; first props on the two nav components |
| `middleware.ts` | Modified | Add `/nomina`, `/api/employees`, `/api/payroll-payments` to prefixes + matcher |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Gate skipped on one layer (nav-only) → worker reaches payroll | High | All four layers required; page+route are authoritative; treat as security acceptance criteria |
| Partial write: payroll row without expense (or reverse) on Postgres | Med | Single repo-level transaction (decision #2); mock atomic in-process |
| Missing business_id scoping leaks cross-business payroll | Med | Denormalized `business_id` column + `getById` business check, matching every existing repo |
| Threading props into two prop-less client nav components breaks their tests | Med | Additive optional `items` prop; update `sidebar`/`bottom-nav` tests |
| Middleware prefix forgotten for one new path | Low | Add all three to both prefixes array and matcher |

## Rollback Plan

Revert the PR and run migration Down (`DROP TABLE payroll_payments, employees CASCADE`). All code is additive; existing pages/routes/nav gain only optional props or extra list entries. Nomina-created expenses are ordinary `category:'nomina'` rows already tolerated by the dashboard, so a revert leaves them as inert historical expenses — no income/expense regression.

## Dependencies

- Exploration `sdd/nomina-payroll/explore` (Engram #54).
- `createExpense` (Phase 2, ready as-is) and `canViewPayroll` (Phase 1 stub).

## Success Criteria

- [x] Migration creates business-scoped `employees` (editable) + append-only `payroll_payments` (`period_type`/`period_start`/`period_end`, integer amounts).
- [x] Choosing `period_type` (quincenal/mensual) + a reference date correctly derives `period_start`/`period_end` (quincenal splits correctly at the 15th/16th across 28-31 day months; mensual spans the full calendar month).
- [x] `createPayrollPayment` atomically records the payment AND a `category:'nomina'` expense visible in Egresos.
- [x] `admin` sees "Nómina" and can use it; `worker` sees no nav item, gets 404 at `/nomina`, and 403 (`FORBIDDEN`) from every payroll API route.
- [x] Employees editable (name/salary/active) via `PATCH /api/employees/[id]`; payroll payments have no edit/delete.
- [x] Both mock and Postgres backends pass; payroll fixtures excluded from `seedMinimal`.

## Proposal question round — resolved

1. **Period representation — RESOLVED**: the admin picks `period_type` ('quincenal' | 'mensual') plus a reference date; the server computes and stores `period_start`/`period_end` (date range) deterministically from that choice — quincenal splits at the 15th/16th of the reference month (correctly handling 28/29/30/31-day months), mensual spans the full calendar month. The UI displays the computed range and day count (`period_end - period_start + 1`, not persisted, derived for display only — matches this codebase's "don't store derivable values" convention).
2. **No correction/void path** for a mistaken payroll payment this phase (accepted MVP constraint, matching Payment/Expense's existing append-only limitation) — proceeding as recommended, documented as a known constraint rather than silently omitted.
3. **Worker UX** — 404 at `/nomina` (not a redirect-to-login, not a "no access" screen) — proceeding as recommended, avoids disclosing the feature exists to a worker.
4. **Payment→expense atomicity** — proceeding with a single Postgres transaction (this codebase's first true multi-statement transaction) so a payroll payment and its linked expense are always created together or not at all — sdd-design must confirm the Neon driver's transaction API and how the mock backend achieves the equivalent all-or-nothing guarantee (likely trivial, since the mock store is synchronous in-process).
