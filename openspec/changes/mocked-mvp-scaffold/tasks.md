# Tasks: Mocked MVP Scaffold — 8 Capabilities

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~2500-3000 (foundation ~200, mock layer ~350, schemas ~150, server utils ~150, services ~450, routes ~550, UI/pages ~750, e2e ~150) |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR 1 (foundation+mock layer) → PR 2 (mock-auth-session) → PR 3 (business-profile) → PR 4 (customers) → PR 5 (invoices) → PR 6 (payments) → PR 7 (dashboard) → PR 8 (receipts) → PR 9 (api-docs) → PR 10 (e2e+cleanup) |
| Delivery strategy | auto-chain |
| Chain strategy | stacked-to-main |

Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Foundation + mock data layer (money, status, ports, api-error, store, lock, fixtures, repos) | PR 1 | base: main. Everything downstream depends on this. |
| 2 | mock-auth-session | PR 2 | base: main (after PR1 merged). session.ts, middleware, login/logout. |
| 3 | business-profile | PR 3 | base: main. Read-only settings page only. |
| 4 | customers | PR 4 | base: main. Schema+service+routes+pages. |
| 5 | invoices | PR 5 | base: main, depends on customers. Safety-critical numbering. |
| 6 | payments | PR 6 | base: main, depends on invoices. Safety-critical overpay/concurrency. |
| 7 | dashboard | PR 7 | base: main, depends on invoices+payments. |
| 8 | receipts | PR 8 | base: main, depends on invoices+payments. |
| 9 | api-docs | PR 9 | base: main. Includes Scalar SSR fallback check. |
| 10 | e2e smoke + concurrency + cleanup | PR 10 | base: main, last. |

Each PR merges to main in order (stacked-to-main); later PRs assume prior ones are merged.

## Phase 1: Foundation (money, status, ports, errors)

- [x] 1.1 RED: `lib/money.test.ts` — roundHalfUp, lineTotal, formatCOP
- [x] 1.2 GREEN: implement `lib/money.ts`
- [x] 1.3 RED: `lib/services/status.test.ts` — precedence paid > partially_paid > overdue > pending
- [x] 1.4 GREEN: implement `lib/services/status.ts`
- [x] 1.5 Define `lib/services/ports.ts` (AuthPort, Customer/Invoice/Payment/BusinessRepository, Session)
- [x] 1.6 Define `lib/server/api-error.ts` (ApiError + codes)

## Phase 2: Mock data layer

- [x] 2.1 RED: `lib/mock/lock.test.ts` — withLock serializes concurrent calls
- [x] 2.2 GREEN: implement `lib/mock/lock.ts` (promise-chain mutex)
- [x] 2.3 Implement `lib/mock/store.ts` (globalThis singleton, per-business seq) + `lib/mock/fixtures/*`
- [x] 2.4 RED (SAFETY-CRITICAL): `lib/mock/invoice-repo.test.ts` — Promise.all N concurrent creates yield unique sequential numbers, no collisions
- [x] 2.5 GREEN: implement `lib/mock/invoice-repo.ts` (create under withLock(businessId), atomic invoice+items insert)
- [x] 2.6 RED (SAFETY-CRITICAL): `lib/mock/payment-repo.test.ts` — two concurrent payments whose sum exceeds balance: exactly one succeeds, balance never negative
- [x] 2.7 GREEN: implement `lib/mock/payment-repo.ts` (withLock(invoiceId): read balance, reject overpay, derive customerId, insert, recompute status)
- [x] 2.8 Implement `lib/mock/customer-repo.ts`, `lib/mock/business-repo.ts`, `lib/mock/auth-adapter.ts` (seeded demo user)
- [x] 2.9 Wire `lib/services/repositories.ts` to mock implementations

## Phase 3: Schemas (Zod, strict)

- [x] 3.1 RED: `lib/schemas/customer.test.ts` — rejects business_id/balances, isActive defaults true
- [x] 3.2 GREEN: implement `lib/schemas/customer.ts`
- [x] 3.3 RED: `lib/schemas/invoice.test.ts` — rejects number/status/totals/business_id, item qty>0/unitPrice>=0
- [x] 3.4 GREEN: implement `lib/schemas/invoice.ts`
- [x] 3.5 RED: `lib/schemas/payment.test.ts` — rejects customerId/business_id/status, amount>0
- [x] 3.6 GREEN: implement `lib/schemas/payment.ts`

## Phase 4: Server utils

- [x] 4.1 RED: `lib/session.test.ts` — requireSession throws UNAUTHENTICATED without cookie
- [x] 4.2 GREEN: implement `lib/session.ts`
- [x] 4.3 RED: `lib/server/http.test.ts` — withApiHandler maps errors, sets no-store, parses page/pageSize (max 50)
- [x] 4.4 GREEN: implement `lib/server/http.ts` + `lib/server/origin-check.ts`

## Phase 5: Services

- [x] 5.1 RED `lib/services/customer-service.test.ts` (scoping, PATCH rejects business_id/balances) → 5.2 GREEN implement
- [x] 5.3 RED (SAFETY-CRITICAL) `lib/services/invoice-service.test.ts` — server-computed total/status even with forged input, cross-business customerId rejected, invalid item aborts whole creation → 5.4 GREEN implement
- [x] 5.5 RED (SAFETY-CRITICAL) `lib/services/payment-service.test.ts` — overpay rejected with no partial apply, balance=0 rejected → 5.6 GREEN implement
- [x] 5.7 RED `lib/services/dashboard-service.test.ts` — all 5 metrics isolated to session business_id → 5.8 GREEN implement
- [x] 5.9 RED `lib/services/business-service.test.ts` — returns the business record scoped to `session.businessId` via `repositories.business`, NOT_FOUND if missing → 5.10 GREEN implement `lib/services/business-service.ts` (read-only, no update method) [business-profile]

## Phase 6: API routes

- [x] 6.1 `middleware.ts` guard + `app/api/auth/{login,logout}/route.ts` + integration test (401 without cookie) [mock-auth-session]
- [x] 6.2 `app/api/customers/route.ts` + `[id]/route.ts` (GET/POST/PATCH) + tests: pagination, cross-business NOT_FOUND [customers]
- [x] 6.3 `app/api/invoices/route.ts` + `[id]/route.ts` (GET/POST) + tests: forged fields ignored, GET always returns recomputed status [invoices]
- [x] 6.4 `app/api/invoices/[id]/payments/route.ts` + `app/api/payments/route.ts` + tests: overpay → 400 VALIDATION_ERROR, derived customerId [payments]
- [x] 6.5 `app/api/dashboard/summary/route.ts` + test: no cross-business leakage [dashboard]
- [x] 6.6 `lib/openapi/{registry,document}.ts` (zod-to-openapi) + `app/api/openapi.json/route.ts` + test: no secrets [api-docs]
- [x] 6.7 `app/api/docs/page.tsx` (Scalar, `dynamic(ssr:false)`) — FALLBACK CHECK: if `@scalar/api-reference-react` fails under React 19 SSR/build, fall back to a static link page to `/api/openapi.json` instead of blocking the PR [api-docs]. RESULT: Scalar worked cleanly (typecheck/lint/test/build all pass) — no fallback needed.

## Phase 7: Pages/UI

- [x] 7.1 `app/(auth)/login/page.tsx` [mock-auth-session]
- [x] 7.2 `app/(dashboard)/dashboard/page.tsx` + `loading.tsx` (5 KPIs + Create actions) [dashboard]
- [x] 7.3 `app/(dashboard)/customers/page.tsx` + `[id]/page.tsx` + `customer-form-dialog.tsx` (ssr:false) + `loading.tsx` [customers]
- [x] 7.4 `app/(dashboard)/invoices/{page,new/page,[id]/page}.tsx` + `invoice-item-fields.tsx` (useFieldArray, ssr:false) + `invoice-status-badge.tsx` + `loading.tsx` [invoices]
- [x] 7.5 `app/(dashboard)/payments/page.tsx` + `payment-form-dialog.tsx` (ssr:false) [payments]
- [x] 7.6 `app/(dashboard)/settings/page.tsx` — read-only Negocio, no PATCH [business-profile]
- [x] 7.7 `app/(print)/invoices/[id]/receipt/page.tsx` + payment receipt view — verbatim non-removable DIAN legal notice [receipts]

## Phase 8: E2E, concurrency proof, cleanup [x] ALL COMPLETE (PR10 — FINAL BATCH)

- [x] 8.1 Extend `e2e/smoke.spec.ts`: login → create customer → create invoice → partial payment → assert balance/status → print shows DIAN notice
- [x] 8.2 Add concurrency test (`e2e/concurrency.spec.ts` or Vitest integration): fire 2 simultaneous `POST /api/invoices/[id]/payments` on same invoice summing over balance; assert exactly one 201 + one 422, final balance never negative — RESULT: real HTTP proof built as `e2e/concurrency.spec.ts` (Playwright `request` fixture against the real dev server); actual rejection status is `400 VALIDATION_ERROR` (this project's established convention, not `422` — confirmed against `app/api/invoices/[id]/payments/payments-routes.test.ts`). Also added a companion real-HTTP test proving invoice numbering stays unique under concurrent load (re-confirming PR1's repo-unit-level guarantee at the full route-handler level).
- [x] 8.3 Run `npm run test` and `npm run build`; fix regressions — RESULT: no regressions; see Apply Progress for full gate results (typecheck/lint/test/build/e2e all green).
- [x] 8.4 Update `.env.example`; remove TODOs — RESULT: `.env.example` already covered every `process.env.*` var actually referenced in app code (`APP_ORIGIN`, `DEMO_LOGIN_EMAIL`, `DEMO_LOGIN_PASSWORD`, `SUPABASE_SERVICE_ROLE_KEY`; `NODE_ENV`/`CI` are platform-provided, not app config) — no edit needed there. No leftover `TODO`/`FIXME`/`XXX` comments or dead/commented-out code found anywhere in `lib`, `app`, `components`, `middleware.ts`, or `e2e`.
