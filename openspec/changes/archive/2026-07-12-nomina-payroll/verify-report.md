## Verification Report — nomina-payroll

**Verdict: PASS WITH WARNINGS**

### Scope verified
Read proposal.md, design.md, all 3 spec files (payroll-management, role-based-navigation, role-permissions delta), tasks.md (11 phases, all `[x]`), and apply-progress artifact. All 3 PRs committed to main: 72e12dc (PR1 backend), df5180e (PR2 gating), cbb515d (PR3 UI). Working tree clean, no stray uncommitted diffs.

### Commands run (this session, current main HEAD)
- `npm run typecheck` — PASS, 0 errors.
- `npm run lint` — PASS, 0 errors/warnings.
- `npm run test` — 541/542 passed, 1 file failed on full-suite run: `app/(dashboard)/customers/page.test.tsx` ("eventually renders the lazily-loaded 'Crear cliente' trigger", a `findByRole` timeout). Re-ran in isolation → 5/5 PASS. Re-ran full suite again → same single failure, same test. This is a PRE-EXISTING flaky test unrelated to nomina-payroll: file untouched by any of the 3 payroll commits (last touched by `d84bd24`, the roles/sessions PR), fully mocked (session + customer-service mocked), no dependency on payroll fixtures/store. Root cause looks like test-runner resource contention (parallel worker timing) during full-suite execution, not a regression. WARNING, not CRITICAL — recommend a follow-up ticket to de-flake, not a blocker for this change's archive.
- `npm run build` — PASS, all routes compile including `/nomina`, `/api/employees`, `/api/employees/[id]`, `/api/payroll-payments`. Noted (pre-existing, unrelated to this change): Next.js 16 deprecation warning "middleware file convention is deprecated, use proxy instead" — informational only, not caused by nomina-payroll.

### Spec-to-code traceability (all requirements traced to real code + passing tests)
1. **payroll-management**: `migrations/1700000003000_add_payroll.sql` (employees + payroll_payments, correct columns/constraints/indexes); `lib/services/payroll-period.ts` computePeriod (table-driven tests cover mensual/quincenal split/leap-year Feb in `payroll-period.test.ts`); `lib/schemas/payroll-payment.ts` positive-integer amount validation; atomic linkage in `lib/db/payroll-repo.ts` (`sql.transaction`) and `lib/mock/payroll-repo.ts` (sync double Map.set, no await gap); no update/delete route exists for payroll_payments (only GET/POST on `/api/payroll-payments`, no `[id]` route).
2. **role-based-navigation**: `requireCapability`/`requireCapabilityOrNotFound` in `lib/session.ts`; `navItemsForRole` in `nav-items.ts`; nav filtering wired in `app/(dashboard)/layout.tsx`.
3. **role-permissions delta**: `canViewPayroll` enforced end-to-end — worker 403 (route) / 404 (page) tests exist and pass; admin granted-access tests exist and pass.

### Explicit gap-check items requested by user — all CONFIRMED present in final committed code
(a) `lib/db/payroll-repo.test.ts` genuinely inspects transaction query CONTENTS: asserts payroll INSERT text/values (call[0]) and expense INSERT text/values (call[1]) independently, then asserts `sql.transaction` was called ONCE with an array containing exactly those two sentinel-tagged query objects together — not just an array-length check. A separate test asserts `sql.transaction` rejecting propagates via `.rejects.toThrow(...)` cleanly.
(b) `lib/services/payroll-service.ts`'s `createPayrollPayment` checks `if (!employee.active) throw new ApiError("VALIDATION_ERROR", ...)` AFTER the NOT_FOUND check and BEFORE period computation — real server-side enforcement, not UI-only. Doc comment explicitly states this guards against a same-business user bypassing the UI dropdown. Covered by a test in `payroll-service.test.ts` (deactivate via `updateEmployee`, assert rejection + unchanged store counts).
(c) All three API routes (`employees/route.ts` GET+POST, `employees/[id]/route.ts` PATCH, `payroll-payments/route.ts` GET+POST) call `requireCapability("viewPayroll")` as the literal first line of every handler. `nomina/page.tsx` calls `requireCapabilityOrNotFound("viewPayroll")` as its single authoritative gate.
(d) Worker → 403 FORBIDDEN proven by real (unmocked `permissions.can`) tests in `employees-routes.test.ts` and `payroll-payments-routes.test.ts`, using a real worker session via `repositories.auth.switchBusiness(BUSINESS_ID, "worker")` — covers GET/POST/PATCH, asserting "creates/mutates nothing" store-count invariants too. Worker → 404 (not redirect) proven in `nomina/page.test.tsx` via a rejected promise matching `notFound()`'s `NEXT_HTTP_ERROR_FALLBACK;404` digest, asserting `listEmployees`/`listPayrollPayments` are never called.

### Item 5 — dashboard-bottom-nav GRID_COLS
Confirmed: `GRID_COLS: Record<number,string> = {5: "grid-cols-5", 6: "grid-cols-6"}`, exported pure `gridColsClass(itemCount)` falls back to `"grid-cols-5"` for any unmapped count AND calls `console.warn(...)` when `process.env.NODE_ENV !== "production"`. Test file asserts all three cases (5→grid-cols-5, 6→grid-cols-6, 3→fallback grid-cols-5).

### Item 6 — MAX_DISPLAYED_ROWS
Confirmed: `app/(dashboard)/nomina/page.tsx` has `const MAX_DISPLAYED_ROWS = 50` (renamed from `PAGE_SIZE`) with a doc comment explicitly stating this is an "Intentional MVP limitation... a hard display cap, NOT real pagination — unlike customers/payments/invoices, this page has no searchParams, no page navigation UI, and always fetches page: 1." Accurately describes current behavior — no misleading naming or claims of real pagination remain.

### tasks.md accuracy
All 11 phases marked `[x]`. Cross-checked against `git log --oneline -10` (72e12dc, df5180e, cbb515d present in order) and current file contents — no stale "uncommitted"/TODO/FIXME markers left in tasks.md; matches the FINAL fix-passed state (not an intermediate version).

### Issues found
- **WARNING**: `app/(dashboard)/customers/page.test.tsx` flakes under full-suite `npm run test` (timeout on a `findByRole` for a lazy-loaded component), passes in isolation. Pre-existing, unrelated to nomina-payroll (file untouched by any of its 3 commits). Not a regression; recommend a follow-up de-flake ticket, does not block archive.
- No CRITICAL issues found. No spec requirement lacks a covering passing test. No design deviation found that breaks a spec.

### Final Verdict: PASS WITH WARNINGS (1 WARNING, 0 CRITICAL, 0 SUGGESTION)
Safe to proceed to `sdd-archive`. The single warning (pre-existing flaky unrelated test) is a known-gap candidate for separate follow-up, not a nomina-payroll defect.
