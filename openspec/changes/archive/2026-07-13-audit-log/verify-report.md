# Verification Report: audit-log

**VERDICT: PASS**

All 3 chained PRs (`d5ef9bb`, `b892e19`, `d25b24a`) committed to main. Full artifact set verified (proposal, design, 3 specs, tasks).

## Task Completeness

`tasks.md`: all checkboxes `[x]` across Phases 1-10, including Phase 8-9 (PR3, UI) which the stale `apply-progress` Engram artifact (#82) still described as "NOT done" — that memory is outdated pipeline narrative, not a real gap; `tasks.md` itself was updated in `d25b24a`'s diff and matches actual committed code 1:1.

## Test/Build Evidence (all green)

- `npm run typecheck`: clean
- `npm run lint`: clean
- `npx vitest run` (default order): 102 files / 749 passed, 2 skipped (integration test, gated)
- `npx vitest run --sequence.shuffle --sequence.seed=42`: same, all green
- `npx vitest run --sequence.shuffle --sequence.seed=1337`: same, all green
- `npm run build`: clean (Next.js Turbopack), `/api/invoices/[id]` listed once, `/invoices/[id]/edit` route present
- Docker-gated integration test (`RUN_DB_INTEGRATION_TESTS=1` against real Postgres 16 container, port 5433): PASS 2/2 (payment-first x5 + edit-first/downward-edit x5 iterations), confirmed genuinely exercises production SQL text against a live DB (not mocked) — container torn down after.

## Spec-to-Code Traceability (all 3 domains)

**audit-logging**: `audit_log` table has no CHECK constraints (migration `1700000005000`); `AuditLogRepository` exposes only `list`/`create`; `recordAuditLog` derives `businessId` from session; instrumentation calls found for exactly `invoice_created`/`invoice_updated` (`invoice-service.ts`) + `payment_recorded` (`payment-service.ts`); `MovementsPanel` gated via plain `canViewAuditLog(session.role)` at call site in `app/(dashboard)/invoices/[id]/page.tsx`, NOT `requireCapabilityOrNotFound` — confirmed by direct read.

**invoices delta**: `invoice-repo.ts#update` and `payment-repo.ts#createForInvoice` both use the two-statement `sql.transaction()` via shared `runTransaction` (`lib/db/client.ts`), with item DELETE+INSERTs folded into the SAME transaction as the header UPDATE, each individually guarded by the same `NOT EXISTS(payments)` condition (confirmed by reading full file). Dual-layer edit-lock (service + repo) confirmed in `invoice-service.ts` (checks `paidAmount !== 0` before calling repo) and both `invoice-repo.ts` (Postgres) and `mock/invoice-repo.ts` (`withLock` + `paymentsForInvoice` check).

**role-permissions delta**: `viewAuditLog` capability in `permissions.ts` mirrors `canViewPayroll` pattern exactly (admin-only).

## Specific Deep-Dive Checks Requested

1. Two-statement transaction pattern in BOTH `invoice-repo.ts#update` and `payment-repo.ts#createForInvoice`: CONFIRMED, item replacement folded into same transaction.
2. `invoice-payment-concurrency.integration.test.ts` exists, gated by `describe.skipIf(!process.env.RUN_DB_INTEGRATION_TESTS)`, contains real pg-connecting logic (not mocked) — CONFIRMED, ran it, genuinely passed against real Postgres 16 Docker container.
3. `recordAuditLog` has `AUDIT_LOG_TIMEOUT_MS=2500` timeout via `withTimeout()`/Promise-race, not just rejection-catch; doc comment accurately describes "always await for ordering, failure/timeout never propagates" (no "fire-and-forget" language) — CONFIRMED by direct read.
4. `invoiceUpdateSchema` is `export const invoiceUpdateSchema = invoiceCreateSchema;` — genuine same-object alias, locked in by a dedicated `.toBe()` test — CONFIRMED.
5. `MovementsPanel` gated via plain `canViewAuditLog(session.role)` at call site (not `requireCapabilityOrNotFound`); worker still gets full page (200) with panel hidden; dedicated test coverage exists as two distinct assertions in `page.test.tsx` ("does NOT show `<MovementsPanel>` to a worker session, while the rest of the invoice detail page still renders fully") — CONFIRMED.
6. Shared `runTransaction` helper (`lib/db/client.ts`) used consistently by all 4 repos needing the two-statement pattern: `payroll-repo.ts`, `inventory-repo.ts`, `invoice-repo.ts`, `payment-repo.ts` — CONFIRMED via grep, all four import and call it.

## Issues Found

None CRITICAL. None WARNING requiring pre-archive fix.

SUGGESTION (non-blocking, informational only): Engram artifact `sdd/audit-log/apply-progress` (#82) has stale narrative describing PR2 as "NOT committed" and PR3 phases as future work — this predates PR2/PR3 actually landing. Does not affect code correctness or `tasks.md` accuracy; purely a memory-pipeline artifact lag. No action required before archive, but could be refreshed for cleanliness.

## Final Verdict

**PASS.** Ready for `sdd-archive`.
