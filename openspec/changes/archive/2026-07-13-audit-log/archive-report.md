# Archive Report: audit-log

**Change**: audit-log
**Archived**: 2026-07-13
**Status**: COMPLETE (PASS)
**Mode**: hybrid (filesystem + Engram)

---

## Executive Summary

Audit Log (MovementsPanel) + Invoice Editing — Fase 2 point 9 — has been fully implemented, verified, and archived. All 3 chained PRs are committed to main (`d5ef9bb`, `b892e19`, `d25b24a`). Invoices can now be edited, but only while they carry zero payments — one payment locks the invoice forever, enforced independently at both the service and repository layers. An append-only `audit_log` table now records `invoice_created`/`invoice_updated`/`payment_recorded` events, best-effort and timeout-guarded, surfaced to admins via a `<MovementsPanel>` widget that is the app's first widget-level (not page-level) role gate — workers still see the full invoice detail page, just without the panel. Verification passed clean: zero CRITICAL, zero WARNING, one informational SUGGESTION (a stale Engram narrative artifact, no code impact). But the most consequential outcome of this change is not the audit log itself — it is a genuine, previously-unknown correctness bug found in code that had already shipped and was believed safe, discovered purely because this team empirically tested against a real database instead of trusting inspection. That story is detailed below.

---

## What Shipped

### PR 1: `d5ef9bb` — Invoice Editing + a Real Concurrency Bug Fix in Already-Shipped Code
- `InvoiceUpdate` type + `InvoiceRepository.update` (both backends) in `ports.ts`.
- `lib/mock/invoice-repo.ts#update`: runs inside `withLock(invoiceId)` (the same lock key `payment-repo.ts` uses for `createForInvoice`); rejects with `CONFLICT` if any payment exists, zero mutation.
- `lib/db/invoice-repo.ts#update`: guarded `UPDATE ... WHERE ... AND NOT EXISTS (SELECT 1 FROM payments ...)`; items replaced (DELETE + re-INSERT) only after the guarded UPDATE returns a row.
- `updateInvoice` service (`invoice-service.ts`): resolves via the existing `getInvoice` read path (`getById` → `withFinance` → `computeStatus`) and rejects if `paidAmount !== 0` — no independent re-summing of payments. `number` is immutable; items/customer re-validated identically to `createInvoice`.
- **The concurrency fix to `lib/db/payment-repo.ts#createForInvoice`** — see "The Significant Correctness Story" below; this is the highest-stakes part of this PR and touches code that predates this change entirely.
- Shared `runTransaction` helper extracted to `lib/db/client.ts`, now used consistently by `payroll-repo.ts`, `inventory-repo.ts`, `invoice-repo.ts`, and `payment-repo.ts`.
- Full backend test suite for invoice editing (mock + db, cross-business isolation, zero-mutation-on-reject proof) plus a follow-up 4-lens review fix pass (atomic guarded item replacement, a committed re-runnable integration test, stronger value assertions, boundary tests, empty-items guard) — all committed in the same commit.

### PR 2: `b892e19` — Audit Log Backend + Instrumentation
- Migration `1700000005000_add_audit_log.sql`: `audit_log` table (`business_id`, `entity_type TEXT`, `entity_id UUID`, `action TEXT`, `actor_user_id UUID`, `detail TEXT`, `created_at`) — deliberately **no CHECK constraints** on `entity_type`/`action`, extensible by design — plus `idx_audit_log_entity` index.
- `AuditLogEntry`/`AuditLogCreate`/`AuditLogRepository` (`ports.ts`, list/create only — no update/delete surface) + dual-backend repos (`lib/{mock,db}/audit-log-repo.ts`, mirroring `expense-repo.ts`'s append-only shape) + `repositories.ts` wiring + `lib/mock/store.ts` `auditLogs` Map with `?? []` hydration for cookie backward-compat.
- `lib/services/audit-log-service.ts`: `recordAuditLog` (best-effort, swallow-and-log, never rethrows — the parent mutation must always succeed regardless of audit outcome) and `listAuditLog` (thin pass-through). A post-review fix pass added `AUDIT_LOG_TIMEOUT_MS = 2500` with a `Promise.race`-based `withTimeout()` wrapper so a hung insert (pool exhaustion, cold connection) can never hold the caller's `await` open indefinitely.
- `viewAuditLog` capability (`permissions.ts`), admin-only, mirroring `canViewPayroll` exactly.
- Instrumentation: `createInvoice`/`updateInvoice` (`invoice-service.ts`) and `createPayment` (`payment-service.ts`) each call `recordAuditLog` **after** their repository call resolves — never inside the mutation's own transaction.
- `PATCH /api/invoices/[id]` route: session-gated only (no capability gate — editing is not role-restricted, only *viewing* the audit trail is), validated with `invoiceUpdateSchema` (shipped as a genuine `= invoiceCreateSchema` alias, locked in by a `.toBe()` test, so the two schemas can never silently drift apart).

### PR 3: `d25b24a` — Invoice-Edit UI + MovementsPanel
- `invoice-form-content.tsx` gains an optional `invoice?` prop (pre-fills fields, switches POST→PATCH); new `app/(dashboard)/invoices/[id]/edit/page.tsx` route (a sibling route was the natural fit since invoice creation was already a full-page form, not a dialog).
- `app/(dashboard)/invoices/[id]/page.tsx`: an "Editar factura" action, shown only when `paidAmount === 0`; `<MovementsPanel session entityType="invoice" entityId={invoice.id} />` gated by a **plain `can(session.role, "viewAuditLog")` boolean check at the call site** — deliberately NOT `requireCapabilityOrNotFound`, because that would 404 the entire page for workers. This is the app's first widget-level (not page-level) role gate.
- New `components/domain/audit-log/movements-panel.tsx`: read-only Server Component, Card+Table+empty-state shape mirroring `recent-payments.tsx`, columns Accion/Usuario/Detalle/Fecha.
- Full UI test suite: admin sees the panel; worker sees the full page (200, no 404/redirect) but not the panel — asserted as two distinct assertions, not conflated; "Editar factura" visibility tied to `paidAmount === 0`.

### Verification Gate
`npm run typecheck` / `npm run lint` / `npx vitest run` (102 files, 749 passed, 2 skipped-and-gated) / two shuffled-seed re-runs (seed=42, seed=1337) / `npm run build` — all green. Docker-gated integration test run manually against a real Postgres 16 container: PASS 2/2.

---

## The Significant Correctness Story: An Already-Shipped Overpay Guard Was Never Actually Safe

This is the story worth reading closely: **while building a new feature, empirical testing uncovered that existing, already-shipped, previously-trusted code had a real concurrency bug** — not in the new invoice-edit code being written, but in `lib/db/payment-repo.ts`'s payment-recording overpay guard, which had been in production since before this change began.

### Why the bug existed and was invisible until now

The overpay guard in `payment-repo.ts#createForInvoice` had never before needed to contend with a **second kind of writer** touching the same `invoices` row. It only ever raced against itself (concurrent payments), and its existing CTE-based guard was adequate for that case. Invoice editing introduced, for the first time, a **second writer type** (an `UPDATE` on the invoice header) that could interleave with a payment. Nobody had reason to suspect the payment guard until this new edit path made the interleave possible — and this team chose to verify empirically rather than assume the existing guard would simply "hold."

### What was actually tested

A real Postgres 16 container (Docker) was stood up, seeded with an invoice at zero payments and a positive balance, and two genuinely concurrent requests were fired: one calling the new `invoice-repo.ts#update`'s guarded UPDATE, one calling the existing, unmodified `payment-repo.ts#createForInvoice`'s overpay-guard CTE.

| Configuration | Runs | Result |
|---|---|---|
| Baseline — existing `payment-repo.ts`, unmodified | 6 (3 payment-first + 3 edit-first) | **BROKEN 6/6** — both the edit and a payment could commit in the same race window |
| Single-statement `FOR UPDATE` added to the payment CTE's `invoices i` read | 3 (payment-first) | **STILL BROKEN 3/3** |
| Two-statement `sql.transaction()` fix on both writers | 10 (5 payment-first + 5 edit-first/downward-edit) | **CORRECT 10/10** |

### Why the first candidate fix (single-statement `FOR UPDATE`) also failed

The natural first fix — add `FOR UPDATE` to the payment CTE's `invoices i` read — looked correct by inspection but was proven insufficient. Root cause: the payment transaction's `FOR UPDATE` lock never itself modifies the `invoices` row (the payment only inserts into the sibling `payments` table). Postgres's EvalPlanQual mechanism only re-checks the *locked row's own columns* when a blocked statement resumes after a lock wait — it does not force a fresh read of a correlated subquery over a different table within the same statement. So a blocked concurrent edit's own `NOT EXISTS(payments)` check resumed using its pre-lock-wait snapshot, which was stale. This is a structurally different hazard than the one found and fixed earlier in this same session for `inventario`'s floor-at-zero guard (which locked the same row it read the aggregate from), but it produces the same class of failure: two transactions each believing they were the only writer.

### The shipped fix

A genuine **two-statement `sql.transaction([...])`** was applied symmetrically to **both** `payment-repo.ts#createForInvoice` and `invoice-repo.ts#update` — both writers must contend on the same row lock, not just one of them:
1. `SELECT id FROM invoices WHERE id=$id AND business_id=$businessId FOR UPDATE` — unconditionally acquires and holds the invoice row lock before any `payments`-table read happens in that transaction.
2. The actual guarded mutation (balance-CTE insert, or the guarded header UPDATE) — as a *separate* statement under READ COMMITTED, it takes a fresh snapshot at its own start, only after the lock from statement 1 resolves.

Whichever writer starts first holds the lock through both its statements; the other writer's own statement 1 blocks until the first commits, then takes a fresh, correct snapshot. This mirrors `lib/db/inventory-repo.ts`'s already-proven two-statement pattern from earlier in this session, and the mechanism note now lives once in `lib/db/client.ts`'s shared `runTransaction` helper — used consistently by all four repos that need it (`payroll-repo.ts`, `inventory-repo.ts`, `invoice-repo.ts`, `payment-repo.ts`).

### This time, backed by a committed, re-runnable test — not just manual verification

Unlike a purely manual verification exercise, this fix is now backed by a **committed, re-runnable integration test**: `lib/db/invoice-payment-concurrency.integration.test.ts`. It reproduces both race orderings (payment-first and downward-edit-first) against a REAL Postgres 16 container using two genuine `pg` connections and a deterministic hold-open-then-release overlap technique (polling `pg_stat_activity` until the second writer genuinely blocks on the invoice row lock, rather than relying on timing/sleeps), asserting exactly one writer ever commits and the invoice ends in a consistent state (totals match items, balance never negative).

It is intentionally gated behind `describe.skipIf(!process.env.RUN_DB_INTEGRATION_TESTS)` — excluded from the default `npm test`/CI run because this repo has no standing test-database infrastructure and CI/sandbox environments may lack Docker — but it is committed to the repository and trivially re-runnable by any future contributor:

```sh
docker run --rm -d --name bmp-pg-test -e POSTGRES_PASSWORD=postgres -p 5433:5432 postgres:16
RUN_DB_INTEGRATION_TESTS=1 \
  TEST_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5433/postgres \
  npx vitest run lib/db/invoice-payment-concurrency.integration.test.ts
docker rm -f bmp-pg-test
```

Re-run during this session's verification pass: **PASS, 2/2** (5 payment-first + 5 edit-first iterations each), deterministic across repeated runs, against a real Postgres 16 container. This means a future refactor of either `payment-repo.ts` or `invoice-repo.ts` that accidentally reintroduces the race will be caught by CI-adjacent tooling the moment someone runs the gated suite — not by a future engineer having to rediscover this bug the hard way, months or years later, in production.

### Why this matters beyond this one change

This is the second time in this session's work (after `inventario`'s floor-at-zero guard) that a `FOR UPDATE`-based guard that looked correct by inspection was proven broken only by standing up a real database and firing genuinely concurrent requests at it. The pattern is now established: **any future append-only-ledger-with-atomic-guard feature in this codebase should assume single-statement locking is insufficient until empirically proven otherwise**, and should budget for a committed, gated integration test as the artifact that actually closes the loop — not a one-time manual verification that leaves no trace for the next person.

---

## Verification Verdict

**Status**: PASS (0 CRITICAL, 0 WARNING, 1 SUGGESTION — informational only, no action required)

### Test Results
| Command | Result | Details |
|---------|--------|---------|
| `npm run typecheck` | PASS | 0 errors |
| `npm run lint` | PASS | 0 errors/warnings |
| `npx vitest run` (default order) | 749/749 PASS | 102 files, 2 skipped (Docker-gated integration test) |
| `npx vitest run --sequence.shuffle --sequence.seed=42` | PASS | test-order independence confirmed |
| `npx vitest run --sequence.shuffle --sequence.seed=1337` | PASS | test-order independence confirmed |
| `npm run build` | PASS | `/api/invoices/[id]` listed once; `/invoices/[id]/edit` route present |
| `RUN_DB_INTEGRATION_TESTS=1 npx vitest run lib/db/invoice-payment-concurrency.integration.test.ts` (Docker, Postgres 16) | PASS 2/2 | Manually re-run during verification; genuinely exercises production SQL against a live DB |

### Completeness
- Tasks: 10 phases, all `[x]` on the persisted `tasks.md`; cross-checked against `git log` (`d5ef9bb`, `b892e19`, `d25b24a` present in order).
- Spec compliance: all requirements across `audit-logging` (5), `invoices` delta (2), and `role-permissions` delta (1) traced to real, tested code — COMPLIANT.
- The two-statement transaction pattern independently re-confirmed by direct code reading during verify (not by trusting prior claims), in both `invoice-repo.ts#update` and `payment-repo.ts#createForInvoice`.

### Informational Suggestion (no action required)
Engram artifact `sdd/audit-log/apply-progress` (#82) contains a stale narrative describing PR2 as "NOT committed" and PR3 as future work — this predates PR2/PR3 actually landing on main. Purely a memory-pipeline artifact lag; `tasks.md` and the actual committed code were already correct and in agreement. No action required before archive.

---

## Artifact Traceability (Engram Observation IDs)

| Artifact | ID | Status |
|----------|----|----|
| Proposal | 78 | archived |
| Spec | 79 | archived |
| Design | 80 | archived |
| Tasks | 81 | archived |
| Apply Progress (cumulative, PR1+PR2+review-fix) | 82 | archived (contains a known-stale narrative section, see above) |
| Verify Report | 85 | archived |

All artifacts persist in Engram for audit trail; this archive report is saved as `sdd/audit-log/archive-report` (topic_key-based upsert).

---

## Specs Synced to Main

### New Specs (Created)
- `openspec/specs/audit-logging/spec.md` — new capability: business-scoped/append-only audit trail, free-text `entity_type`/`action` columns with no CHECK constraint, best-effort/non-transactional insert semantics with an accepted crash-window gap, the exactly-3-events instrumentation scope (`invoice_created`/`invoice_updated`/`payment_recorded`), and the widget-level (not page-level) `MovementsPanel` gate — 5 requirements copied directly from the change's full spec, since no prior main spec existed for this domain.

### Modified Specs (Delta Merged)
- `openspec/specs/invoices/spec.md` — 2 ADDED requirements appended: "Invoice Editing Locked to Zero-Payment Invoices" and "Edit-Lock Enforced in Both Service and Repository Layers." All 6 pre-existing requirements (List/Create/Detail/Status computation/Integer-cents/Atomic creation/business_id scoping) preserved unchanged.
- `openspec/specs/role-permissions/spec.md` — 1 ADDED requirement appended: "viewAuditLog Capability Is Admin-Only," including the explicit widget-vs-page-gate distinguishing scenario. All 5 pre-existing requirements preserved unchanged.

---

## SDD Cycle Complete

- **Proposal** (intent, scope, approach): #78
- **Spec** (requirements, scenarios): #79
- **Design** (technical approach, file changes, the edit-lock race mechanism and its resolution): #80
- **Tasks** (work units, phases, verification gate): #81
- **Apply** (3 chained PRs, full implementation, plus the payment-repo concurrency fix): `d5ef9bb`, `b892e19`, `d25b24a`
- **Verify** (test execution, compliance, spec-to-code traceability, concurrency-fix re-verification): #85 (PASS)
- **Archive** (specs synced, artifacts archived, this report): `2026-07-13-audit-log`

---

## Next Steps

1. **Immediate**: None — archive complete. Change closed.
2. **Future work enabled by this change**: The audit-logging pattern (`recordAuditLog`/`listAuditLog`, timeout-guarded best-effort insert) is ready to extend to Nomina/Inventario mutations without a migration (free-text `entity_type`/`action`). The widget-level `can()` gate pattern (vs. page-level `requireCapabilityOrNotFound`) is now precedented for any future admin-only UI element that shouldn't block the whole page.
3. **Process note**: this change reconfirms the lesson from `inventario` — a `FOR UPDATE`-based guard that looks correct by inspection must be empirically verified against a real Postgres container before being trusted, and should be backed by a committed, gated integration test (not a one-time manual check) so a future refactor cannot silently reintroduce the race. This is now the second empirically-caught concurrency bug in this codebase's history, and the pattern should be treated as a standing methodology for any future append-only-ledger-with-atomic-guard feature.

---

**Archive Date**: 2026-07-13
**Archived By**: sdd-archive executor
**Final Status**: READY FOR NEXT CHANGE
