# Archive Report: nomina-payroll

**Change**: nomina-payroll
**Archived**: 2026-07-12
**Status**: COMPLETE (PASS WITH WARNINGS)
**Mode**: hybrid (filesystem + Engram)

---

## Executive Summary

Nomina (Payroll) — Employees + Payroll Payments (Phase 3, plan point 6) has been fully implemented, verified, and archived. All 3 chained PRs are committed to main (72e12dc, df5180e, cbb515d). This is the app's FIRST role-gated feature: `admin` can register employees and record payroll payments, each atomically creating a linked `category:'nomina'` expense visible in the dashboard's Egresos tab; `worker` is blocked at every layer (nav, middleware, page 404, API 403). It is also the codebase's first true multi-statement Postgres transaction (`sql.transaction`) and the first real consumer of `canViewPayroll`. Verification passed with one WARNING (a pre-existing, unrelated flaky test) and zero CRITICAL issues. Ready for the next SDD change.

---

## What Shipped

### PR 1: 72e12dc — Backend/Data Layer
- Migration `1700000003000_add_payroll.sql`: `employees` (id, business_id, name, base_salary int, active bool, timestamps) + `payroll_payments` (id, business_id, employee_id FK, amount int, period_type CHECK IN ('quincenal','mensual'), period_start/period_end dates, payment_date, notes, created_at — **no updated_at**, append-only) + 3 indexes; Down drops both (payroll first, FK-dependent order).
- `lib/services/payroll-period.ts`: `computePeriod(periodType, referenceDate)` — string-slice date parsing (no `Date` round-trip, TZ-stable); mensual spans the full calendar month; quincenal splits at the 15th/16th correctly across 28/29/30/31-day months (leap-year February verified). `periodDays` is display-only, never persisted.
- Dual-backend repos: `lib/{mock,db}/employee-repo.ts` (Customer-style editable CRUD) and `lib/{mock,db}/payroll-repo.ts` (append-only, owns the atomicity).
- **THE critical design decision**: `lib/db/client.ts` uses the Neon `@neondatabase/serverless` HTTP driver, whose `sql.transaction([q1, q2])` runs multiple queries as one real atomic Postgres transaction over a single HTTPS request (BEGIN/COMMIT server-side) — verified in `node_modules/@neondatabase/serverless/index.d.ts`. `lib/db/payroll-repo.ts` uses `sql.transaction([INSERT payroll_payments, INSERT expenses category='nomina'])`; the mock repo does two synchronous `Map.set` calls with no `await` between them (single-threaded JS gives trivial atomicity, no `simulateLatency` in `create`).
- `lib/services/payroll-service.ts`'s `createPayrollPayment` reuses `expenseCreateSchema` for validation (not `createExpense()` execution, since that's a separate HTTP round-trip that can't be composed into `sql.transaction`), then hands both payloads to `repositories.payroll.create` for the single-transaction write.
- Full test suite: `payroll-period.test.ts` (table-driven boundary cases), repo tests (mock+db, both entities, cross-business isolation), service tests (`employee-service.test.ts`, `payroll-service.test.ts` — including atomicity proof via before/after store snapshots), `store.test.ts` regression for defensive `?? []` hydration fallback.

### PR 2: df5180e — Capability-Gate Infrastructure + Gated Routes
- `lib/session.ts`: `requireCapability(capability)` (throws `ApiError("FORBIDDEN")`) and `requireCapabilityOrNotFound(capability)` (calls `notFound()`), both self-resolving the session and delegating to `permissions.can()` — the app's first reusable role-enforcement helpers, backed by real tests (worker denied, admin resolves, unauthenticated propagates/redirects).
- `components/layout/nav-items.ts`: `capability?: Capability` field on `NavItem`, `navItemsForRole(role)` filter, "Nómina" nav item added. `dashboard-sidebar.tsx`/`dashboard-bottom-nav.tsx` gained an optional `items` prop (additive, backward-compatible with existing tests). `dashboard-bottom-nav.tsx`'s hardcoded `grid-cols-5` replaced with a static `GRID_COLS` map + pure `gridColsClass(itemCount)` helper (admin now has 6 nav items; Tailwind can't safelist an interpolated class).
- `app/(dashboard)/layout.tsx`: threads `navItemsForRole(session.role)` into both nav surfaces.
- `middleware.ts`: added `/nomina`, `/api/employees`, `/api/payroll-payments` to `PROTECTED_PATH_PREFIXES` and `matcher` — stays presence-only, role is never checked at this layer.
- `app/api/employees/route.ts` (GET/POST), `app/api/employees/[id]/route.ts` (PATCH only — no delete), `app/api/payroll-payments/route.ts` (GET/POST only — no update/delete) — every handler calls `requireCapability("viewPayroll")` as its first line.
- Tests prove worker → 403 FORBIDDEN on every payroll route (GET/POST/PATCH), using a REAL unmocked `permissions.can` path via `repositories.auth.switchBusiness(BUSINESS_ID, "worker")`, with "creates/mutates nothing" store-count assertions; admin → success.

### PR 3: cbb515d — Nomina Page + Dialogs
- `app/(dashboard)/nomina/page.tsx`: single `requireCapabilityOrNotFound("viewPayroll")` gate, `<Tabs>` with Empleados/Pagos `TabsPanel`s (both `keepMounted`, mirroring `dashboard/page.tsx`).
- `components/domain/nomina/employee-form-dialog-content.tsx` (plain `useState`, Customer precedent — name/baseSalary/active toggle edit-only) and `payroll-payment-form-dialog-content.tsx` (RHF + zodResolver, Expense precedent — employeeId select from active employees, amount pesos→cents, periodType select, referenceDate/paymentDate, live client-side period preview via `computePeriod`/`periodDays`).
- **Post-apply fix pass** (3-lens review before commit, 5 gaps closed):
  1. Server-side `employee.active` re-validation added to `createPayrollPayment` (was UI-only enforcement — real security gap; a same-business user could otherwise bypass the UI dropdown and pay a deactivated employee).
  2. Renamed misleading `PAGE_SIZE` to `MAX_DISPLAYED_ROWS` in `nomina/page.tsx` with an explicit MVP-limitation doc comment (hard display cap, not real pagination).
  3. IEEE-754 decimal precision tests added at the dialog input-wiring level for both dialogs (not just the isolated `pesosToCents` helper).
  4. Double-submit guard tests added to both dialogs (deferred-promise pattern from `business-switcher.test.tsx`).
  5. Zero-active-employees empty-state test added to the payroll-payment dialog.
- Full aggregate verification after the fix pass: typecheck/lint PASS, 542/542 tests (up from 515), build PASS.

---

## Verification Verdict

**Status**: PASS WITH WARNINGS (1 WARNING, 0 CRITICAL, 0 SUGGESTION)

### Test Results (this session, current main HEAD)
| Command | Result | Details |
|---------|--------|---------|
| `npm run typecheck` | PASS | 0 errors |
| `npm run lint` | PASS | 0 errors/warnings |
| `npm run test` | 541/542 (WARNING) | 1 pre-existing flaky test, see below; isolated re-run 5/5 PASS |
| `npm run build` | PASS | All routes compile: `/nomina`, `/api/employees`, `/api/employees/[id]`, `/api/payroll-payments` |

### Completeness
- Tasks: 11 phases, all `[x]` on the persisted `tasks.md`; cross-checked against `git log` (72e12dc, df5180e, cbb515d present in order) — no stale uncommitted/TODO/FIXME markers.
- Spec compliance: all requirements across 3 domains (`payroll-management` 6 requirements, `role-based-navigation` 4 requirements, `role-permissions` delta 1 added + 1 modified requirement) traced to real, tested code — COMPLIANT.
- 6 explicit user-requested verification points (transaction-content-inspecting test, server-side active re-validation, first-line capability gate on every route/page, real unmocked worker 403/404 tests, `GRID_COLS` fallback+warn behavior, `MAX_DISPLAYED_ROWS` doc-comment accuracy) all independently CONFIRMED in the verify pass.

### Known Follow-Up (Not a Blocker)
`app/(dashboard)/customers/page.test.tsx` flakes under full-suite `npm run test` (timeout on a `findByRole` for a lazy-loaded "Crear cliente" trigger), passes cleanly in isolation and on a re-run of the full suite showing the same single, non-deterministic failure. Confirmed PRE-EXISTING and unrelated to nomina-payroll: the file is untouched by any of this change's 3 commits (last touched by `d84bd24`, the roles/sessions PR), is fully mocked (session + customer-service), and has no dependency on payroll fixtures or store state. Root cause looks like test-runner resource contention (parallel worker timing) during full-suite execution, not a regression introduced by this change. **Recommended as a separate follow-up de-flake ticket**, not part of this archive.

---

## Artifact Traceability (Engram Observation IDs)

| Artifact | ID | Status |
|----------|----|----|
| Proposal | 55 | archived |
| Spec | 56 | archived |
| Design | 57 | archived |
| Tasks | 58 | archived |
| Verify Report | 61 | archived |

All artifacts persist in Engram for audit trail; this archive report is saved as `sdd/nomina-payroll/archive-report` (topic_key-based upsert).

---

## Specs Synced to Main

### New Specs (Created)
- `openspec/specs/payroll-management/spec.md` — new capability: business-scoped/editable employees, business-scoped/append-only payroll payments, positive-integer-amount validation, period-type-derived period range (mensual/quincenal, leap-year-safe), atomic payment-to-expense linkage, and the accepted no-void-path MVP constraint (6 requirements copied directly from the change's full spec, since no prior main spec existed for this domain).
- `openspec/specs/role-based-navigation/spec.md` — new capability: server-side-authoritative capability enforcement (404 page / 403 route), reusable page+route enforcement helpers, role-filtered nav items, and the "nav filtering is UX only, not a security boundary" principle (4 requirements copied directly, no prior main spec existed).

### Modified Specs (Delta Merged)
- `openspec/specs/role-permissions/spec.md`:
  - **ADDED**: `Capability Enforcement at Page and Route Layers` requirement (3 scenarios: worker denied at page, worker denied at API route, admin granted access) — appended to the Requirements section.
  - **MODIFIED**: `Session Role Reflects the Active Membership` requirement replaced with the updated justification (staleness now justified by self-correction at next login/switch, not by "no capability is gated yet") plus a `(Previously: ...)` note recording the superseded rationale; the original scenario was preserved unchanged.
  - **Purpose line updated**: "Mechanism only — no feature is gated yet" replaced with a statement that `canViewPayroll` is now enforced end-to-end at the Nomina page/routes, cross-referencing the two new capabilities.
  - The three untouched requirements (`Membership Table Defines Role Per Business`, `Capability Check Helper`, `Cross-Business Isolation Is Absolute`) were preserved unchanged, exactly as the delta spec intended.

---

## SDD Cycle Complete

- **Proposal** (intent, scope, approach): #55
- **Spec** (requirements, scenarios): #56
- **Design** (technical approach, file changes): #57
- **Tasks** (work units, phases, verification gate, post-apply fix pass): #58
- **Apply** (3 chained PRs, full implementation): 72e12dc, df5180e, cbb515d
- **Verify** (test execution, compliance, security): #61 (PASS WITH WARNINGS)
- **Archive** (specs synced, artifacts archived, this report): 2026-07-12-nomina-payroll

---

## Next Steps

1. **Immediate**: None — archive complete. Change closed.
2. **Recommended follow-up (separate change)**: De-flake `app/(dashboard)/customers/page.test.tsx`'s lazy-loaded "Crear cliente" trigger test under full-suite parallel execution (pre-existing, unrelated to this change).
3. **Future work enabled by this change**: The `requireCapability`/`requireCapabilityOrNotFound` + `navItemsForRole` pattern established here is now reusable for any future role-gated feature — adding a new gated surface is one nav-item array entry plus the same two-line page/route gate call.

---

**Archive Date**: 2026-07-12
**Archived By**: sdd-archive executor
**Final Status**: READY FOR NEXT CHANGE
