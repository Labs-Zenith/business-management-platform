# Invoices Specification

## Purpose

Create and query internal (non-fiscal) invoices with server-computed items, totals, numbering, and status, scoped to the authenticated business.

## Requirements

### Requirement: List Invoices Scoped to Business

`GET /api/invoices` MUST return only invoices whose `business_id` matches the session, MUST support optional `customerId`, `status`, `from`, `to`, `page` (min 1), `pageSize` (max 50), and MUST include, per invoice: customer, `total`, `paid_amount`, `balance`, and server-computed `status`.

#### Scenario: Filtered list

- GIVEN an authenticated session for business B1
- WHEN `GET /api/invoices?status=overdue` is called
- THEN only B1 invoices whose computed status is `overdue` are returned

### Requirement: Create Invoice With Server-Computed Values

`POST /api/invoices` MUST require an existing `customerId` belonging to the same business, at least one item, `quantity > 0`, `unitPrice >= 0`. The server MUST compute `line_total = quantity * unitPrice` (integer minor units, round-half-up), `subtotal = sum(line_totals)`, `total = subtotal` (no taxes/discounts in MVP), an atomically generated `number` unique per `business_id`, and the initial `status`. The system MUST ignore or reject any client-supplied `number`, `status`, `subtotal`, `total`, `line_total`, or `business_id`.

#### Scenario: Client attempts to forge computed fields

- GIVEN a valid item list
- WHEN the payload also includes `status: "paid"` and `total: 999999`
- THEN the invoice is created with the server-computed `total` and initial status (`pending`); the forged values are discarded

#### Scenario: Concurrent invoice creation for the same business

- GIVEN two `POST /api/invoices` requests for the same `business_id` arrive at nearly the same time
- WHEN both are processed
- THEN each receives a unique `number` for that `business_id`; no duplicate number is ever produced (atomic per-business numbering)

#### Scenario: Invalid item rejected atomically

- GIVEN a payload where one item has `quantity <= 0` or a negative `unitPrice`
- WHEN the invoice is submitted
- THEN the request is rejected with `VALIDATION_ERROR` and no invoice or item is persisted (all-or-nothing)

#### Scenario: Customer from a different business

- GIVEN a `customerId` belonging to business B2
- WHEN a B1 session submits it
- THEN the request is rejected and no invoice is created

### Requirement: Invoice Detail With Recomputed Status

`GET /api/invoices/{id}` MUST return the invoice, customer, items, payments, `paid_amount`, `balance`, and status recomputed at read time from current data. If the persisted `status` differs from the computed status, the response MUST use the computed value.

#### Scenario: Stale persisted status corrected on read

- GIVEN an invoice whose persisted `status` is `pending` but whose `due_date` has passed with `balance > 0`
- WHEN the invoice is fetched
- THEN the response status is `overdue`, not the stale persisted value

### Requirement: Invoice Status Computation Rules

Status MUST be computed in this order: (1) `balance = 0` → `paid`; (2) `balance > 0` and at least one payment exists → `partially_paid`; (3) `balance > 0`, no payments, and `due_date` is null or in the future → `pending`; (4) `balance > 0`, no payments, and `due_date` has passed → `overdue`.

#### Scenario: Overdue takes priority over pending only

- GIVEN an invoice with no payments, `balance > 0`, and `due_date` in the past
- WHEN status is computed
- THEN the result is `overdue`

#### Scenario: Partially paid invoice past due stays partially_paid

- GIVEN an invoice with at least one payment, `balance > 0`, and `due_date` in the past
- WHEN status is computed
- THEN the result is `partially_paid` (rule 2 is evaluated before rule 4)

### Requirement: Integer-Cents Money Representation

All monetary amounts MUST be stored and computed as integer minor units (cents). Rounding, if needed, MUST apply round-half-up only at `line_total` computation. Currency formatting (COP, no decimal digits) MUST occur only at display edges.

#### Scenario: Fractional unit price rounding

- GIVEN `quantity = 3` and a `unitPrice` producing a fractional cent in `line_total`
- WHEN `line_total` is computed
- THEN it is rounded half-up to the nearest integer cent before being summed into `subtotal`/`total`

### Requirement: Atomic Invoice Creation

Invoice header and item insertion MUST be atomic: either all rows are persisted or none are.

#### Scenario: Failure mid-creation leaves no partial data

- GIVEN a multi-item invoice submission where processing fails after some items are validated
- WHEN the failure occurs
- THEN no invoice header and no items from that submission are persisted

### Requirement: business_id Scoping (RLS-Equivalent)

Every invoice read and write MUST filter/validate against `business_id` resolved from the session. The mock service layer enforces this today as the functional equivalent of the future RLS policy restricting `invoices` and `invoice_items` to their owning `business_id`.

#### Scenario: Mock service layer enforces scoping

- GIVEN any invoice query or mutation
- WHEN it executes against the mock store
- THEN it is filtered by the session's `business_id`

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
