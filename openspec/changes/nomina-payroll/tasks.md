# Tasks: Nomina (Payroll) — Employees + Payroll Payments

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~1750-2050 total (PR1 ~850-950: migration ~35, ports ~60, period-logic ~25, schemas ~40, mock+db employee-repo ~90, mock+db payroll-repo w/ transaction ~110, repositories/store/fixtures wiring ~70, employee+payroll services ~90, tests ~350-400 / PR2 ~500-600: session.ts helpers ~15, nav-items+sidebar+bottom-nav+layout wiring ~70, middleware ~10, 3 API routes ~150, tests ~250-300 / PR3 ~400-500: page ~60, employee dialog ~120, payroll-payment dialog ~150, tests ~150) |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR 1 (schema + ports + dual-backend repos + services + period-logic, fully tested) → PR 2 (capability-gate infra + nav changes + middleware + API routes) → PR 3 (Nomina page + dialogs UI) |
| Delivery strategy | ask-on-risk (default; not overridden this session) |
| Chain strategy | feature-branch-chain (recommended, matching `roles-multi-business`/`expenses-dashboard-split`'s 3-PR precedent; ask user to confirm before apply) |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: feature-branch-chain
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Migration + ports + `payroll-period.ts` + zod schemas + dual-backend `employee-repo`/`payroll-repo` (payroll repo owns the `sql.transaction`/two-`Map.set` atomicity) + `repositories.ts`/`store.ts`/fixtures wiring + `employee-service`/`payroll-service`, fully unit-tested (mock + db, both entities) | PR 1 | Base = feature/tracker branch. Self-contained backend slice; no UI, no gating; both backends independently testable. Highest risk of budget overrun — if a single reviewer pass would exceed ~500 lines, split further into 1a (migration+ports+period-logic+schemas+repos+store/fixtures) / 1b (services+tests). |
| 2 | `requireCapability`/`requireCapabilityOrNotFound` (`lib/session.ts`) + capability-tagged nav (`nav-items.ts`, `navItemsForRole`, sidebar/bottom-nav `items` prop, bottom-nav `GRID_COLS` fix) + `layout.tsx` filtering + `middleware.ts` prefixes + gated `app/api/employees/**`/`app/api/payroll-payments/**` routes | PR 2 | Base = PR 1 branch. Depends on PR 1's ports/services. This is the app's FIRST role-gated surface — treat every gate layer as a security acceptance criterion, not a nice-to-have. |
| 3 | `app/(dashboard)/nomina/page.tsx` (Empleados/Pagos tabs, `requireCapabilityOrNotFound`) + employee create/edit dialog + payroll-payment entry dialog, wired into the page | PR 3 | Base = PR 2 branch. Depends on PR 2's gated routes existing to POST/PATCH against, and PR 1's service/type exports. |

## Phase 1: Schema, Ports & Period Logic (Foundation)

- [x] 1.1 Create `migrations/1700000003000_add_payroll.sql`. Up: `employees` (`id UUID PK`, `business_id UUID NOT NULL REFERENCES businesses(id)`, `name TEXT NOT NULL`, `base_salary INTEGER NOT NULL`, `active BOOLEAN NOT NULL DEFAULT true`, `created_at`/`updated_at TIMESTAMPTZ DEFAULT now()`) + index on `business_id`; `payroll_payments` (`id UUID PK`, `business_id UUID NOT NULL REFERENCES businesses(id)`, `employee_id UUID NOT NULL REFERENCES employees(id)`, `amount INTEGER NOT NULL`, `period_type TEXT NOT NULL CHECK (period_type IN ('quincenal','mensual'))`, `period_start DATE NOT NULL`, `period_end DATE NOT NULL`, `payment_date DATE NOT NULL`, `notes TEXT`, `created_at TIMESTAMPTZ DEFAULT now()`, **no `updated_at`** — append-only) + indexes on `business_id`/`employee_id`. Down: `DROP TABLE IF EXISTS payroll_payments CASCADE` then `employees CASCADE` (FK-dependent order).
- [x] 1.2 `lib/services/ports.ts`: add `Employee`/`EmployeeCreate`/`EmployeeUpdate`/`EmployeeListQuery`/`EmployeeRepository` (list/getById/create/update, per design.md interfaces section) and `PeriodType`/`PayrollPaymentInput`/`PayrollPaymentPersist`/`PayrollPayment`/`PayrollPaymentWithEmployee`/`PayrollPaymentListQuery`/`PayrollPaymentRepository` (list/getById/create only — `create` signature takes `(businessId, data: PayrollPaymentPersist, expense: ExpenseInput)`, documented as atomic).
- [x] 1.3 Create `lib/services/payroll-period.ts`: `computePeriod(periodType, referenceDate)` (string-slice date parsing, NO `Date` round-trip for output — TZ-stable) and `periodDays(periodStart, periodEnd)` (display-only, never persisted), per design.md's exact implementation.
- [x] 1.4 Create `lib/schemas/employee.ts`: `.strict()` `employeeCreateSchema` (name, baseSalary positive integer) and `employeeUpdateSchema` (partial name/baseSalary + optional active).
- [x] 1.5 Create `lib/schemas/payroll-payment.ts`: `.strict()` `payrollPaymentCreateSchema` (employeeId, amount positive integer, periodType enum, referenceDate date-string, paymentDate date-string, optional notes).

## Phase 2: Repositories & Store

- [x] 2.1 Create `lib/mock/employee-repo.ts`: Customer-style mock repo (list/getById/create/update), business-scoped, cross-business lookups return `null`/excluded from list.
- [x] 2.2 Create `lib/db/employee-repo.ts`: Postgres repo mirroring the mock's contract via parameterized SQL (Customer pattern), business-scoped filtering.
- [x] 2.3 Create `lib/mock/payroll-repo.ts`: `list`/`getById` business-scoped (joins employee name for `PayrollPaymentWithEmployee`); `create` does `store.payrollPayments.set(...)` then `store.expenses.set(...)` with **no `await` between them** (no `simulateLatency` in `create`, unlike `payment-repo.ts`) — single-threaded JS gives trivial atomicity.
- [x] 2.4 Create `lib/db/payroll-repo.ts`: `create` uses `sql.transaction([insertPayroll, insertExpense])` (real Neon HTTP-driver transaction, per design.md's verified `sql.transaction` API) inserting both rows in one atomic round-trip; `list`/`getById` join `employees` for the display name.
- [x] 2.5 `lib/services/repositories.ts`: wire `employees: isDbConfigured ? dbEmployeeRepo : mockEmployeeRepo` and `payroll: isDbConfigured ? dbPayrollRepo : mockPayrollRepo`.
- [x] 2.6 `lib/mock/store.ts`: add `employees: Map<string, Employee>` and `payrollPayments: Map<string, PayrollPayment>` to `MockStore`/`SerializedStore`; wire into `serializeStore`/`clearStore`/`createEmptyStore`; `hydrateStore` uses `?? []` defensive fallback for both (cookie backward-compat, matching expenses' Risk R4 precedent).
- [x] 2.7 `lib/mock/fixtures/data.ts`: add `EmployeeFixture`/`PayrollPaymentFixture` types, id-block helpers (next unused prefix after expenses'), and demo employee + payroll-history fixture arrays.
- [x] 2.8 `lib/mock/fixtures/index.ts`: `seedFixtures` loops the new fixtures into store maps scoped to `BUSINESS_ID`; confirm `seedMinimal` does **NOT** seed employees/payroll (cookie-size constraint, matching invoices/payments/expenses).

## Phase 3: Services

- [x] 3.1 Create `lib/services/employee-service.ts`: `listEmployees`, `getEmployee` (throws `ApiError("NOT_FOUND")`), `createEmployee`, `updateEmployee` (forwards only name/baseSalary/active) — line-for-line analog of `customer-service.ts`.
- [x] 3.2 Create `lib/services/payroll-service.ts`: `createPayrollPayment(session, input)` — `computePeriod`, `repositories.employees.getById` (404 if missing), re-validate the derived expense payload with `expenseCreateSchema` (validation reuse only, NOT `createExpense()` execution — can't compose a separate HTTP round-trip into `sql.transaction`), then `repositories.payroll.create(businessId, persistData, expenseData)`.

## Phase 4: PR1 Tests (Backend Layer)

- [x] 4.1 `lib/services/payroll-period.test.ts`: table-driven boundary cases — mensual full-month span, quincenal day-15/16 split, Feb 28/29 (leap year), 30- vs 31-day months, matching all 4 spec scenarios.
- [x] 4.2 `lib/mock/employee-repo.test.ts` + `lib/db/employee-repo.test.ts`: business-scoped isolation, update applies name/baseSalary/active, no delete operation exists.
- [x] 4.3 `lib/mock/payroll-repo.test.ts` + `lib/db/payroll-repo.test.ts`: business-scoped isolation; atomicity — snapshot store/mock `sql` before/after to prove both rows persist together (mirrors `payment-service.test.ts`'s partial-state-impossibility style); DB test mocks `sql.transaction` and asserts both queries are passed in one call.
- [x] 4.4 `lib/services/employee-service.test.ts`: CRUD + cross-business `NOT_FOUND`.
- [x] 4.5 `lib/services/payroll-service.test.ts`: `createPayrollPayment` derives correct period, rejects unknown `employeeId` (404), rejects zero/negative/non-integer `amount` (`VALIDATION_ERROR`), writes both rows atomically.
- [x] 4.6 `lib/mock/store.test.ts`: regression — `hydrateStore` on a payload missing `employees`/`payrollPayments` fields does not throw.

## Phase 5: Capability-Gate Infrastructure (PR2)

- [ ] 5.1 `lib/session.ts`: add `requireCapability(session, capability)` (throws `ApiError("FORBIDDEN")`) and `requireCapabilityOrNotFound(session, capability)` (calls `notFound()`), both delegating to `permissions.can()`.
- [ ] 5.2 `lib/session.test.ts`: `requireCapability` throws `FORBIDDEN` for a role lacking the capability, passes silently otherwise; `requireCapabilityOrNotFound` calls `notFound()` under the same condition.

## Phase 6: Nav Changes

- [ ] 6.1 `components/layout/nav-items.ts`: add optional `capability?: Capability` to `NavItem`; add `{ href: "/nomina", label: "Nómina", icon: Banknote, capability: "viewPayroll" }`; add `navItemsForRole(role)` filtering by `can(role, item.capability)`.
- [ ] 6.2 `components/layout/dashboard-sidebar.tsx`: accept optional `items` prop (default `NAV_ITEMS`), backward-compatible.
- [ ] 6.3 `components/layout/dashboard-bottom-nav.tsx`: accept optional `items` prop; replace hardcoded `grid-cols-5` with a static `GRID_COLS: Record<number, string>` map (`{5: "grid-cols-5", 6: "grid-cols-6"}`) keyed by `items.length` (Tailwind cannot safelist an interpolated class).
- [ ] 6.4 `app/(dashboard)/layout.tsx`: compute `const items = navItemsForRole(session.role)`, pass `items={items}` to both `<DashboardSidebar>` and `<DashboardBottomNav>`.
- [ ] 6.5 Tests: `navItemsForRole("worker")` excludes Nómina, `("admin")` includes it; sidebar/bottom-nav render tests updated for the `items` prop; bottom-nav renders `grid-cols-6` with 6 items and `grid-cols-5` with 5 (regression for the `GRID_COLS` fix).

## Phase 7: Middleware

- [ ] 7.1 `middleware.ts`: add `"/nomina"`, `"/api/employees"`, `"/api/payroll-payments"` to `PROTECTED_PATH_PREFIXES`; add matching entries to `matcher`. Stays presence-only — no role check here (per convention).

## Phase 8: API Routes

- [ ] 8.1 Create `app/api/employees/route.ts`: `GET` (`requireSession`, `requireCapability(session,"viewPayroll")`, pagination, `listEmployees`), `POST` (`checkOrigin`, `employeeCreateSchema.safeParse`, `createEmployee`, 201).
- [ ] 8.2 Create `app/api/employees/[id]/route.ts`: `PATCH` (`requireCapability`, `checkOrigin`, `employeeUpdateSchema.safeParse`, `updateEmployee`, 404 if missing).
- [ ] 8.3 Create `app/api/payroll-payments/route.ts`: `GET` (`requireCapability`, pagination/filters, `listPayrollPayments`), `POST` (`checkOrigin`, `payrollPaymentCreateSchema.safeParse`, `createPayrollPayment`, 201).
- [ ] 8.4 Tests (`employees-route.test.ts`, `payroll-payments-route.test.ts`): `worker` session → 403 `FORBIDDEN` on every payroll route; `admin` session → success; standard validation/cross-business cases per Phase 4 precedent.

## Phase 9: Nomina Page + Dialogs (PR3)

- [ ] 9.1 Create `app/(dashboard)/nomina/page.tsx`: `requireSessionOrRedirect()` then `requireCapabilityOrNotFound(session, "viewPayroll")`; `<Tabs>` with `Empleados`/`Pagos` `TabsPanel`s (both `keepMounted`, mirroring `dashboard/page.tsx`).
- [ ] 9.2 Create `components/domain/nomina/employee-form-dialog-content.tsx` + `employee-form-dialog.tsx` (lazy `dynamic(..., {ssr:false})` wrapper): plain `useState` (Customer precedent); fields name, baseSalary (pesos→cents), active toggle (edit-only, excluded on create); POST/PATCH then `router.refresh()`.
- [ ] 9.3 Create `components/domain/nomina/payroll-payment-form-dialog-content.tsx` + wrapper: RHF + `zodResolver` (Expense precedent); fields employeeId (select, active employees only), amount (pesos→cents), periodType (select), referenceDate/paymentDate (date inputs, default today), notes; client-side live preview via `computePeriod`/`periodDays`; POST then `router.refresh()`.
- [ ] 9.4 Wire both dialogs into the page's Empleados/Pagos tabs from 9.1.

## Phase 10: PR3 Tests

- [ ] 10.1 `app/(dashboard)/nomina/page.test.tsx`: `worker` session → not-found (404); `admin` session → both tabs render with `keepMounted` content present.
- [ ] 10.2 `employee-form-dialog-content.test.tsx`: valid submit POSTs/PATCHes cents-converted payload, calls `router.refresh()`; active toggle hidden on create, shown on edit.
- [ ] 10.3 `payroll-payment-form-dialog-content.test.tsx`: valid submit POSTs correct payload; period preview updates live on `periodType`/`referenceDate` change; invalid amount blocks submission client-side.

## Phase 11: Verification Gate

- [ ] 11.1 `npm run typecheck`
- [ ] 11.2 `npm run lint`
- [ ] 11.3 `npm run test`
- [ ] 11.4 `npm run build`
</content>
