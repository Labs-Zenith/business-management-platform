# Proposal: Invoice Editing for Partially-Paid Invoices + COP Audit Detail

## Intent

Fase 3 item 3 asks for invoices to remain editable while money is still owed,
not just before the first payment. Today's edit-lock rule (`invoice-edit-lock`
change, shipped with `audit-log`) is stricter than the business actually
needs: a single partial payment locks an invoice forever, even when it is
nowhere near fully paid. This blocks the common case of correcting a
line-item typo or adding a missed item on an invoice that already has a
deposit against it. This phase relaxes the rule to "editable while not fully
paid," while keeping the existing overpay-safety invariant intact: an edit can
never shrink an invoice's total below money already collected.

Folded in (item 8): the `invoice_updated` and `payment_recorded` audit-log
`detail` strings currently show raw integer cents (`"Amount: 80000"`) instead
of a human-readable COP amount. This phase fixes both to use `formatCOP`, and
upgrades `invoice_updated`'s detail from just the invoice number to a
before/after total comparison (`"Total: $X → $Y"`), which is more useful for
the `MovementsPanel` audit trail this rule change makes more relevant (edits
against invoices with a balance are now common, not just zero-payment ones).

## Scope

### In Scope (this PR — PR1, backend)

- **Guard predicate change**: `updateInvoice` (service), `InvoiceRepository.update`
  (both `lib/mock/invoice-repo.ts` and `lib/db/invoice-repo.ts`) now allow
  editing while `balance > 0` (not fully paid), reject once `balance <= 0`
  (fully paid), and additionally reject an edit whose submitted new `total`
  would drop below `paidAmount` — the latter as a `VALIDATION_ERROR` (a
  distinct, clean rejection reason from the fully-paid `CONFLICT`).
- **Status recomputation fix**: `updateInvoice` now computes `status` from the
  invoice's REAL `paidAmount` (via `computeStatus(total, invoice.paidAmount,
  dueDate)`), not the previously-safe-but-now-wrong hardcoded `0` — a
  partially-paid invoice being edited must land on `partially_paid`, not
  `pending`.
- **Audit detail format** (folded item 8): `invoice_updated`'s detail becomes
  `"Total: <old COP> → <new COP>"`; `payment_recorded`'s detail becomes
  `"Monto: <COP>"` (both via `formatCOP`, replacing raw-cents strings).
- **Concurrency mechanism preserved, predicate only replaced**: the existing
  two-statement `FOR UPDATE` transaction (`lib/db/invoice-repo.ts#update`) and
  the mock's `withLock(id)` mutex are structurally unchanged — only the guard
  condition each statement carries changes, from `NOT EXISTS(payments)` to the
  compound "not fully paid AND new total not below paid" predicate.
- Test coverage for all three edit outcomes (partially-paid succeeds,
  fully-paid rejects, below-paid-total rejects) at the repo, service, and
  route layers, plus updated concurrency-integration scenarios.

### Out of Scope (deferred to PR2)

- UI changes: the invoice edit page, detail page's "Editar factura" gating,
  and `invoice-form-content.tsx` still reflect the OLD zero-payment copy/gating
  and are not touched in this PR.
- Any change to the payment-side overpay guard itself (`payment-repo.ts`) —
  only the edit-side guard's predicate changes; the payment side already
  recomputes against the invoice's current total on every attempt.
- Field-level diffing in the audit detail (still a single summary string).

## Capabilities

### Modified Capabilities

- `invoices`: the edit-lock guard changes from "zero payments only" to "not
  fully paid, and new total not below paid."

## Approach

**Guard change, not a mechanism change.** The two-statement `FOR UPDATE`
transaction pattern in `lib/db/invoice-repo.ts` (statement 1 locks the row;
statement 2+ run a fresh-snapshot guarded mutation) is proven correct by the
existing concurrency integration test and is reused byte-for-byte — only the
boolean guard condition embedded in each statement's `WHERE`/`EXISTS` clause
changes, from `NOT EXISTS (SELECT 1 FROM payments ...)` to:

```
(total - COALESCE(SUM(payments), 0)) > 0        -- not fully paid
AND <new total> >= COALESCE(SUM(payments), 0)    -- new total not below paid
```

The mock repository mirrors this with a plain JS computation under the same
`withLock(id)` mutex it already used.

**Service layer**: `updateInvoice` reorders its checks — resolve the invoice,
reject immediately if fully paid (`CONFLICT`, before any other work), then
validate the customer/items, compute the new total, and reject if that total
is below `paidAmount` (`VALIDATION_ERROR`, a client-input problem rather than
a state conflict). `status` is now computed from the real `paidAmount`.

**Audit**: `formatCOP` (already used at other UI edges) is imported into
`invoice-service.ts` and `payment-service.ts` to format the `detail` string
at the point the audit row is recorded — the audit repository itself is
untouched (it already stores `detail` as free text).

## Affected Areas

| Area | Impact | Description |
|------|--------|--------------|
| `lib/services/invoice-service.ts` | Modified | Reordered edit-lock guard (fully-paid `CONFLICT` first, below-paid `VALIDATION_ERROR` after computing the new total); `status` computed from real `paidAmount`; `invoice_updated` audit detail now `Total: $X → $Y` |
| `lib/services/payment-service.ts` | Modified | `payment_recorded` audit detail now `Monto: <formatCOP>` |
| `lib/mock/invoice-repo.ts` | Modified | `update`'s defense-in-depth guard replaced with the compound not-fully-paid + not-below-paid check |
| `lib/db/invoice-repo.ts` | Modified | Same compound guard, expressed in SQL, across the header UPDATE + item DELETE + item INSERT statements (mechanism unchanged) |
| `lib/mock/invoice-repo.test.ts`, `lib/db/invoice-repo.test.ts` | Modified | Three-way edit-outcome coverage (partial succeeds / fully-paid rejects / below-paid rejects), zero-mutation assertions on rejection |
| `lib/db/invoice-payment-concurrency.integration.test.ts` | Modified | Scenario assertions updated to the new predicate; added a partial-payment-does-not-block-edit scenario |
| `lib/services/invoice-service.test.ts`, `lib/services/payment-service.test.ts` | Modified | New guard/status/audit-detail assertions |
| `app/api/invoices/invoices-routes.test.ts` | Modified | Edit-lock expectations updated to the new rule at the route layer |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Guard predicate regresses the overpay-safety invariant (total shrinks below paid) | Low | Both layers (service + repository) independently re-check `new total >= paid`; covered by dedicated tests at every layer |
| Concurrency mechanism accidentally altered while changing the predicate | Low | Kept the two-statement transaction structurally identical; only the embedded boolean condition changed; re-verified against the existing (and extended) integration test |
| UI (PR2) still shows stale "edit locked after first payment" copy until PR2 ships | Medium (accepted) | Explicitly out of scope for this PR; documented here so PR2's scope is unambiguous |

## Rollback Plan

Revert this PR's commits. No schema or migration changes are introduced — the
guard is expressed entirely in application-layer SQL/JS, so rollback is a
pure code revert with no data migration required.

## Dependencies

- Builds on the `audit-log` change's `updateInvoice`/`InvoiceRepository.update`
  foundation (zero-payment edit-lock) — this phase relaxes that guard's
  predicate, not its layering.
- `lib/money.ts#formatCOP` (existing, previously UI-edge-only) is now also
  used at the point audit `detail` strings are constructed in the service
  layer.

## Success Criteria

- [x] A partially-paid invoice (`balance > 0`) can be edited; a fully-paid one
      (`balance <= 0`) cannot, at both the service and repository layers.
- [x] An edit whose new total would drop below `paidAmount` is rejected with
      `VALIDATION_ERROR` and zero mutation, independent of the fully-paid check.
- [x] `status` after an edit is recomputed from the invoice's real `paidAmount`,
      not hardcoded to `0`.
- [x] `invoice_updated` and `payment_recorded` audit details are COP-formatted.
- [x] The two-statement `FOR UPDATE` concurrency mechanism is byte-for-byte
      structurally unchanged; only guard predicates and error messages differ.
