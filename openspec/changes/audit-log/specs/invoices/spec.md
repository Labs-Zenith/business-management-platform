# Delta for Invoices

## ADDED Requirements

### Requirement: Invoice Editing Locked to Zero-Payment Invoices

`updateInvoice` (service) and `PATCH /api/invoices/{id}` MUST allow editing an invoice's items/fields ONLY while that invoice has zero payments recorded (`paid_amount === 0`, equivalently `balance === total`). The system MUST recompute `subtotal`/`total`/`status` server-side from the submitted items, exactly as on creation, and MUST keep the invoice `number` immutable. Any attempt to edit an invoice that has at least one payment MUST be rejected cleanly (a specific, non-500 error) with zero mutation performed — no item, header field, or derived value is changed.

#### Scenario: Zero-payment invoice is editable

- GIVEN an invoice with `paid_amount = 0` (no payments recorded)
- WHEN `PATCH /api/invoices/{id}` is submitted with a revised item list
- THEN the invoice is updated: items are replaced, `subtotal`/`total`/`status` are recomputed server-side, and `number` is unchanged

#### Scenario: Invoice with any payment rejects edit

- GIVEN an invoice with at least one payment recorded (`paid_amount > 0`)
- WHEN `PATCH /api/invoices/{id}` is submitted with any change
- THEN the request is rejected with a specific edit-lock error (not a generic 500), and no field, item, or derived value on the invoice is mutated

#### Scenario: Edit attempt against a fully-paid invoice

- GIVEN an invoice with `balance = 0` (fully paid)
- WHEN `PATCH /api/invoices/{id}` is submitted
- THEN the request is rejected under the same edit-lock rule as any invoice with `paid_amount > 0`

#### Scenario: Client-forged fields ignored on edit, same as creation

- GIVEN a zero-payment invoice being edited
- WHEN the payload includes client-supplied `status`, `total`, `subtotal`, `number`, or `business_id`
- THEN the server-computed/derived values are used instead; the forged values are discarded

### Requirement: Edit-Lock Enforced in Both Service and Repository Layers

The zero-payment edit-lock check MUST be enforced independently at two layers: the service layer (`updateInvoice`) MUST verify zero payments before delegating to the repository, AND the repository layer (`InvoiceRepository.update`) MUST re-verify zero payments itself before persisting, regardless of what the service layer already checked. This defense-in-depth exists because payments are append-only and the existing overpay-safety guarantee assumes an invoice's `total` never shrinks after money has been collected against it; a bug in one layer alone MUST NOT be sufficient to bypass the invariant.

#### Scenario: Repository rejects even if service check is bypassed

- GIVEN a hypothetical caller invokes `InvoiceRepository.update` directly on an invoice with `paid_amount > 0`, bypassing the service-layer check
- WHEN the repository executes the update
- THEN the repository itself rejects the update; the invoice is not mutated

#### Scenario: Service rejects before reaching the repository

- GIVEN `updateInvoice(session, id, data)` is called for an invoice with `paid_amount > 0`
- WHEN the service performs its own zero-payment check
- THEN it rejects before calling `InvoiceRepository.update` at all

#### Scenario: Both layers agree on the same invariant

- GIVEN an invoice with `paid_amount = 0`
- WHEN both the service-layer check and the repository-layer check evaluate it independently
- THEN both agree the invoice is editable, and the edit proceeds
