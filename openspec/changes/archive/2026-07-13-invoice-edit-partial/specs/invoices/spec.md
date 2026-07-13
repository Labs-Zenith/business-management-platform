# Delta for Invoices

## MODIFIED Requirements

### Requirement: Invoice Editing Locked to Fully-Paid Invoices

`updateInvoice` (service) and `PATCH /api/invoices/{id}` MUST allow editing an
invoice's items/fields while that invoice is NOT fully paid (`balance > 0`,
equivalently `paid_amount < total`). The system MUST recompute
`subtotal`/`total`/`status` server-side from the submitted items, exactly as
on creation — `status` MUST be computed using the invoice's REAL current
`paid_amount`, not `0` — and MUST keep the invoice `number` immutable. An
invoice that is fully paid (`balance <= 0`, i.e. `paid_amount >= total`) MUST
be permanently locked: any edit attempt against it MUST be rejected cleanly
with zero mutation performed. Additionally, even for a not-fully-paid invoice,
an edit whose submitted new `total` would drop BELOW the amount already paid
(`total < paid_amount`) MUST be rejected, also with zero mutation — this
preserves the invariant that an invoice's total never shrinks below money
already collected against it.

**Error codes differ by layer, and this is intentional, not an inconsistency:**

- At the SERVICE layer (`updateInvoice`, the path a normal request takes),
  the two rejection reasons are distinguishable and MUST use distinct codes:
  a fully-paid invoice MUST reject with a specific, non-500 `CONFLICT`; a
  below-paid-total edit on a not-fully-paid invoice MUST reject with a
  specific, non-500 `VALIDATION_ERROR` (distinct from the fully-paid
  `CONFLICT`).
- At the REPOSITORY layer (`InvoiceRepository.update`), both conditions are
  expressed as ONE ANDed SQL/JS guard evaluated atomically against a fresh
  snapshot. This layer is reached in the normal case as a pass-through after
  the service already validated, and as the sole gate in the race case where
  a payment lands between the service's check and the repository's atomic
  write. Because the guard is a single compound condition, the repository
  CANNOT distinguish which half failed — it MUST reject with a generic
  `CONFLICT` for ANY guard failure, regardless of whether the underlying
  cause was "fully paid" or "new total below paid". This is correct at this
  layer: a guard failure reached only via the race path means a concurrent
  payment changed the picture after the service checked, which is properly a
  `CONFLICT`, not a client-input `VALIDATION_ERROR`.

Both rejection paths, at either layer, MUST leave zero mutation — no item,
header field, or derived value is changed.

#### Scenario: Partially-paid invoice is editable

- GIVEN an invoice with `paid_amount > 0` but `balance > 0` (partially paid)
- WHEN `PATCH /api/invoices/{id}` is submitted with a revised item list whose
  new total is `>= paid_amount`
- THEN the invoice is updated: items are replaced, `subtotal`/`total` are
  recomputed server-side, `status` is recomputed using the invoice's REAL
  `paid_amount` (e.g. landing on `partially_paid`, not `pending`), and
  `number` is unchanged

#### Scenario: Fully-paid invoice rejects edit

- GIVEN an invoice with `balance = 0` (`paid_amount >= total`, fully paid)
- WHEN `PATCH /api/invoices/{id}` is submitted with any change
- THEN the request is rejected with `CONFLICT` (not a generic 500), and no
  field, item, or derived value on the invoice is mutated

#### Scenario: Edit reducing total below paid_amount is rejected

- GIVEN an invoice with `paid_amount > 0` and `balance > 0` (not fully paid)
- WHEN `PATCH /api/invoices/{id}` is submitted with items whose computed new
  `total` is LESS THAN `paid_amount`
- THEN the request is rejected with `VALIDATION_ERROR` (a distinct error from
  the fully-paid `CONFLICT`), and no field, item, or derived value on the
  invoice is mutated

#### Scenario: Client-forged fields ignored on edit, same as creation

- GIVEN an editable (not-fully-paid) invoice being edited
- WHEN the payload includes client-supplied `status`, `total`, `subtotal`,
  `number`, or `business_id`
- THEN the server-computed/derived values are used instead; the forged values
  are discarded

### Requirement: Edit-Lock Enforced in Both Service and Repository Layers

The not-fully-paid + new-total-not-below-paid edit-lock invariant MUST be
enforced independently at two layers: the service layer (`updateInvoice`)
MUST verify BOTH conditions before delegating to the repository, AND the
repository layer (`InvoiceRepository.update`) MUST re-verify BOTH conditions
itself before persisting, regardless of what the service layer already
checked. This defense-in-depth exists because payments are append-only and
the existing overpay-safety guarantee assumes an invoice's `total` never
shrinks below money already collected against it; a bug in one layer alone
MUST NOT be sufficient to bypass the invariant.

#### Scenario: Repository rejects even if service check is bypassed

- GIVEN a hypothetical caller invokes `InvoiceRepository.update` directly on a
  fully-paid invoice, or with a new total below `paid_amount`, bypassing the
  service-layer check
- WHEN the repository executes the update
- THEN the repository itself rejects the update with a generic `CONFLICT` —
  the SAME code regardless of which of the two conditions caused the
  rejection, since the repository's guard is one ANDed condition and cannot
  distinguish them — and the invoice is not mutated

#### Scenario: Service rejects before reaching the repository

- GIVEN `updateInvoice(session, id, data)` is called for a fully-paid invoice,
  or with data whose computed new total is below the invoice's `paid_amount`
- WHEN the service performs its own checks
- THEN it rejects before calling `InvoiceRepository.update` at all

#### Scenario: Both layers agree on the same invariant

- GIVEN an invoice that is not fully paid, with a submitted new total that is
  not below `paid_amount`
- WHEN both the service-layer checks and the repository-layer checks evaluate
  it independently
- THEN both agree the invoice is editable, and the edit proceeds
