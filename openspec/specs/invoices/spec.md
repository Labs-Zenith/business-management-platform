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
