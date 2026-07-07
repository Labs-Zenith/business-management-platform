# Payments Specification

## Purpose

Register partial or full payments against an invoice with server-derived customer, strict balance enforcement, and atomic concurrency safety.

## Requirements

### Requirement: List Payments Scoped to Business

`GET /api/payments` MUST return only payments whose `business_id` matches the session, with optional `customerId`, `invoiceId`, `from`, `to`, `page` (min 1), `pageSize` (max 50), including customer, invoice, method, and date per payment.

#### Scenario: Filtered payments list

- GIVEN an authenticated session for business B1
- WHEN `GET /api/payments?invoiceId=X` is called
- THEN only B1 payments for invoice X are returned

### Requirement: Register Payment With Server-Derived Customer and Balance Check

`POST /api/invoices/{id}/payments` MUST validate the invoice belongs to the session's `business_id`, require `amount > 0`, and reject any `amount` exceeding the invoice's current `balance` computed at request time. The system MUST derive `customer_id` from the invoice and MUST ignore/reject any client-supplied `business_id`, `customer_id`, balance, or status field.

#### Scenario: Payment equal to remaining balance

- GIVEN an invoice with `balance = 200000` (cents)
- WHEN a payment of `amount = 200000` is registered
- THEN it is accepted and the invoice becomes `paid`

#### Scenario: Overpay rejected

- GIVEN an invoice with `balance = 200000`
- WHEN a payment of `amount = 250000` is submitted
- THEN the request is rejected with a validation/conflict error, no payment is persisted, and the invoice's total paid and status remain unchanged

#### Scenario: Client-supplied customer_id ignored

- GIVEN an invoice belonging to customer C1
- WHEN the payment payload includes `customer_id: C2`
- THEN the persisted payment's `customer_id` is C1, derived from the invoice

#### Scenario: Payment against an already-paid invoice

- GIVEN an invoice with `balance = 0`
- WHEN any payment with `amount > 0` is submitted
- THEN it is rejected because it necessarily exceeds the zero balance

### Requirement: Atomic Payment Registration Prevents Combined Overpay

Payment registration MUST execute as a single atomic operation that locks or consistently reads the target invoice, recalculates `paid_amount`/`balance`, validates `amount <= balance`, derives `customer_id`, inserts the payment, and recomputes invoice status — all before the lock is released — so concurrent requests on the same invoice can never combine to exceed the invoice total.

#### Scenario: Concurrent payments on the same invoice

- GIVEN an invoice with `balance = 200000` and two concurrent payment requests of `amount = 150000` each (each individually valid, but combined exceeding balance)
- WHEN both requests are processed
- THEN only one succeeds; the second is rejected once the recalculated balance is insufficient; total payments recorded never exceed the invoice's `total`

### Requirement: Status Recompute After Payment

After a payment is registered, the response MUST reflect the invoice status recomputed per the invoice status computation rules, based on the new `balance` and payment history.

#### Scenario: Partial payment updates status

- GIVEN a `pending` invoice with no prior payments
- WHEN a partial payment is registered
- THEN the returned invoice status is `partially_paid`

### Requirement: business_id Scoping (RLS-Equivalent)

Every payment read and write MUST filter/validate against `business_id` resolved from the session. The mock service layer enforces this today as the functional equivalent of the future RLS policy restricting `payments` to their owning `business_id`.

#### Scenario: Mock service layer enforces scoping

- GIVEN any payment query or mutation
- WHEN it executes against the mock store
- THEN it is filtered by the session's `business_id`
