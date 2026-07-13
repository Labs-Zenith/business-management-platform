# Tasks: Invoice Editing for Partially-Paid Invoices + COP Audit Detail

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~550-650 total (PR1 backend ~250-300: guard predicate in both repos + service reorder + audit-detail formatting ~120, tests ~350-400 across mock/db/service/route/concurrency-integration / PR2 UI ~150-200: edit page + detail page copy updates, deferred) |
| 400-line budget risk | Medium |
| Chained PRs recommended | Yes |
| Suggested split | PR 1 (backend: guard predicate, service reorder, COP audit-detail formatting, full test coverage) → PR 2 (UI: edit page / detail page copy reflecting the relaxed rule) |
| Delivery strategy | feature-branch-chain (mirrors the prior `audit-log`/`invoice-edit-lock` PR1/PR2/PR3 split for this same area of the codebase) |
| Chain strategy | feature-branch-chain |

Decision needed before apply: No (explicitly resolved by the requester: PR1 backend only, this batch)
Chained PRs recommended: Yes
Chain strategy: feature-branch-chain
400-line budget risk: Medium

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Guard predicate change in `lib/mock/invoice-repo.ts` and `lib/db/invoice-repo.ts`; reordered/extended guard in `lib/services/invoice-service.ts` (fully-paid `CONFLICT` + below-paid-total `VALIDATION_ERROR`, status computed from real `paidAmount`); COP-formatted audit `detail` strings in `invoice-service.ts`/`payment-service.ts`; full test coverage at every layer plus updated concurrency-integration scenarios | PR 1 | Self-contained backend slice. Concurrency MECHANISM (two-statement `FOR UPDATE` transaction / `withLock`) is reused unchanged — only the guard predicate and messages differ. |
| 2 | `invoice-form-content.tsx` / invoice edit page / detail page "Editar factura" gating copy updated to reflect "editable until fully paid" instead of "editable only before any payment" | PR 2 | Base = PR 1 branch. Deferred — out of scope for this batch. |

## Phase 1: Repository Guard Predicate (PR1)

- [x] 1.1 `lib/mock/invoice-repo.ts#update`: replace the zero-payments guard (`paymentsForInvoice(store, id).length > 0 → CONFLICT`) with the compound check — fully paid (`existing.total - paidAmount <= 0`) → `CONFLICT`; new total below paid (`data.total < paidAmount`) → `CONFLICT` (repo-layer defense in depth, opaque to the caller which reason fired). Update the file-level doc comment.
- [x] 1.2 `lib/db/invoice-repo.ts#update`: replace every `NOT EXISTS (SELECT 1 FROM payments p WHERE p.invoice_id = <x>)` guard (header UPDATE's WHERE, the item DELETE's EXISTS guard, each item INSERT's EXISTS guard) with the compound predicate `(total - COALESCE(SUM(payments), 0)) > 0 AND <new total> >= COALESCE(SUM(payments), 0)`. Keep the two-statement `FOR UPDATE` transaction structure byte-for-byte identical — only the embedded boolean condition changes. Update the `updatedRows.length === 0` CONFLICT message and all doc comments referencing the old `NOT EXISTS(payments)` guard.

## Phase 2: Service Layer Reorder (PR1)

- [x] 2.1 `lib/services/invoice-service.ts#updateInvoice`: reorder to (a) resolve the invoice, (b) reject immediately with `CONFLICT` if `invoice.balance <= 0` (fully paid, before any other work), (c) validate customer + item invariants, (d) compute the new `total`, (e) reject with `VALIDATION_ERROR` if `invoice.paidAmount > 0 && total < invoice.paidAmount`, (f) compute `status` from the invoice's REAL `paidAmount` (`computeStatus(total, invoice.paidAmount, dueDate)`, not hardcoded `0`). Update the doc comment to describe both rejection paths and the layered defense-in-depth with the repository.

## Phase 3: COP Audit Detail (Folded Item 8) (PR1)

- [x] 3.1 `lib/services/invoice-service.ts#updateInvoice`: change the `invoice_updated` audit detail to `` `Total: ${formatCOP(invoice.total)} → ${formatCOP(updated.total)}` ``, importing `formatCOP` from `@/lib/money`.
- [x] 3.2 `lib/services/payment-service.ts#createPayment`: change the `payment_recorded` audit detail from `` `Amount: ${persist.amount}` `` to `` `Monto: ${formatCOP(persist.amount)}` ``, importing `formatCOP` from `@/lib/money`.

## Phase 4: PR1 Tests

- [x] 4.1 `lib/mock/invoice-repo.test.ts`: three-way edit-outcome coverage — partially-paid invoice (payment < total) edits successfully; fully-paid invoice (payments sum == total) rejects with `CONFLICT`; edit whose new total < paidAmount rejects with `CONFLICT`; zero-mutation assertions on both rejection paths.
- [x] 4.2 `lib/db/invoice-repo.test.ts`: updated `updValues`/`deleteValues`/`insertValues` assertions to include the new guard's own `total` parameter; renamed/extended CONFLICT test to cover both the fully-paid and below-paid-total exclusion paths (both produce the same empty-`RETURNING` behavior, since the guard is evaluated in SQL); added a dedicated assertion that the guard SQL text contains the compound condition (`COALESCE`, `> 0`, `>=`).
- [x] 4.3 `lib/db/invoice-payment-concurrency.integration.test.ts` (Docker-gated, unchanged mechanism): updated the `EDIT_UPDATE_SQL`/`EDIT_DELETE_SQL`/`EDIT_INSERT_SQL` constants (mirrored verbatim from the shipped repository) to the new compound guard; renamed the payment-first scenario to assert "fully paid" rejection; added a new partial-payment scenario proving a partial payment does NOT block a subsequent edit whose new total still covers what's paid.
- [x] 4.4 `lib/services/invoice-service.test.ts`: replaced the `paidAmount !== 0` rejection test with a partially-paid success test (asserting `status` is computed from the real `paidAmount`) and a below-paid-total `VALIDATION_ERROR` test; kept/verified the fully-paid `CONFLICT` test; added an audit-detail-format assertion (`Total: $X → $Y`, COP-formatted, never raw cents) and updated the "no audit row on rejection" test to also cover the below-paid-total rejection path.
- [x] 4.5 `app/api/invoices/invoices-routes.test.ts`: renamed/re-seeded the edit-lock fixtures (`PARTIALLY_PAID_INVOICE_ID` = fixture 7, `FULLY_PAID_INVOICE_ID` = fixture 10); added a success test for the partially-paid invoice and a 400 `VALIDATION_ERROR` test for a below-paid-total edit; kept the 409 `CONFLICT` test, retargeted at the fully-paid fixture.
- [x] 4.6 `lib/services/payment-service.test.ts`: updated the `payment_recorded` audit-detail assertion to the new `Monto: <formatCOP>` format.

## Phase 5: Verification Gate

- [x] 5.1 `npm run typecheck`
- [x] 5.2 `npm run lint`
- [x] 5.3 `npm run test` (full suite)
- [x] 5.4 `npx vitest run --sequence.shuffle` (full suite, shuffled seed)

## Phase 6: UI Updates (PR2)

- [x] 6.1 `app/(dashboard)/invoices/[id]/edit/page.tsx`: redirect condition changed from `invoice.paidAmount !== 0` to `invoice.balance <= 0` (redirect only when FULLY paid; a partially-paid invoice now renders the form). Doc comment updated from the old zero-payment gate description to "editable while not fully paid; redirect only when fully paid."
- [x] 6.2 `app/(dashboard)/invoices/[id]/page.tsx`: updated the "Editar factura" action's visibility condition from `invoice.paidAmount === 0` to `invoice.balance > 0` (not fully paid). Doc comment updated to match.
- [x] 6.3 `components/domain/invoices/invoice-form-content.tsx`: threaded `paidAmount: number` into `InvoiceFormContentInvoice`; added a live below-paid-total warning (`text-xs text-destructive`, "El total no puede ser menor a lo ya pagado (<formatCOP>)."), shown in edit mode when `paidAmount > 0 && totalCents < paidAmount`, and disabled the submit button while that condition holds (UX only — server remains authoritative). `app/(dashboard)/invoices/[id]/edit/page.tsx` now passes `invoice.paidAmount` into the form prop.

### Phase 6 Tests

- [x] `app/(dashboard)/invoices/[id]/edit/page.test.tsx`: replaced the any-payment-redirects test with a partially-paid-renders-the-form test; kept the fully-paid-redirects test (fixture-equivalent to fixture 10/7 semantics via `buildInvoice` overrides).
- [x] `app/(dashboard)/invoices/[id]/page.test.tsx`: replaced the any-payment-hides test with a partially-paid-shows-the-link test; kept the fully-paid-hides test.
- [x] `components/domain/invoices/invoice-form-content.test.tsx`: added an "edit mode — below-paid-total warning" suite — warning+disabled-submit once the live total (typed via the money input) drops below `paidAmount`, re-enabled once raised back to at least `paidAmount`, and never applies in create mode.

## Review-Fix Addendum (PR1, post-review pass)

A risk/reliability/resilience review of the uncommitted PR1 diff found one
deterministic data-corruption BLOCKER plus spec/test gaps. All fixed in this
pass; no guard-predicate semantics changed.

- [x] R.1 (BLOCKER) `lib/db/invoice-repo.ts#update`: reordered the transaction's
      `queries` array so the header UPDATE runs LAST, strictly after the item
      DELETE/INSERTs (previously: lock, header UPDATE, item DELETE, item
      INSERTs). Root cause: under READ COMMITTED, a later statement in the
      same transaction sees the transaction's own prior writes — with the
      header first, the item guards' fresh subquery read of `invoices.total`
      observed the ALREADY-MUTATED new total, so at the exact boundary where
      the new total equals `paidAmount`, `(newTotal - paid) > 0` evaluated
      FALSE and the item DELETE/INSERTs silently no-op'ed while the header
      still committed — a torn, deterministic (no concurrency needed) data
      corruption with no error thrown. `lockRows`/`updatedRows` now indexed as
      `results[0]`/`results[results.length - 1]`.
- [x] R.2 Reworded `openspec/changes/invoice-edit-partial/specs/invoices/spec.md`'s
      edit-lock requirement to state the two-layer error-code behavior
      accurately: SERVICE layer emits `VALIDATION_ERROR` (below-paid) vs.
      `CONFLICT` (fully-paid); REPOSITORY layer emits a generic `CONFLICT` for
      ANY guard failure (single ANDed guard, race-only fallback, cannot
      distinguish the two causes). Updated `lib/db/invoice-repo.ts`'s CONFLICT
      comment and `lib/mock/invoice-repo.ts`'s guard comment to match; codes
      unchanged (mock already threw `CONFLICT` for both).
- [x] R.3 Added a clarifying comment in `lib/services/invoice-service.ts#updateInvoice`
      near the `computeStatus(...)` call documenting that the persisted
      `status` may be momentarily stale under concurrent payments — accepted,
      pre-existing behavior, since no read path trusts the persisted column.
- [x] R.4 Tests: added the exact-equality boundary test (new total ==
      paidAmount) to `lib/mock/invoice-repo.test.ts` and to the Docker-gated
      `lib/db/invoice-payment-concurrency.integration.test.ts` (real Postgres);
      added a statement-order regression assertion to
      `lib/db/invoice-repo.test.ts`; added no-op-edit-while-partially-paid and
      increase-total-while-partially-paid tests at the mock/service layers;
      changed `invoice-service.test.ts`'s audit-detail assertion from a loose
      regex to the exact composed string; fixed `lib/mock/invoice-repo.test.ts`'s
      partial-paid success fixture to use the invoice's REAL `paidAmount`
      instead of a hardcoded `0`, and assert the persisted status round-trips.
