# Customers Specification

## Purpose

Create, list, view, and edit customers scoped to the authenticated business, with financial summaries derived from invoices and payments.

## Requirements

### Requirement: List Customers Scoped to Business

`GET /api/customers` MUST return only customers whose `business_id` matches the session's resolved `business_id`, and MUST support optional `q` (name/document/email/phone search), `status` (`active`/`inactive`), `page` (min 1), and `pageSize` (max 50).

#### Scenario: List without filters

- GIVEN an authenticated session for business B1
- WHEN `GET /api/customers` is called with no filters
- THEN only B1's customers are returned, paginated

#### Scenario: Cross-business isolation on list

- GIVEN a customer exists under business B2
- WHEN a session for business B1 lists customers with any filter values
- THEN the B2 customer never appears in the response

### Requirement: Create Customer

`POST /api/customers` MUST resolve `business_id` server-side, MUST reject any client-supplied `business_id` via a strict Zod schema (unknown/sensitive fields rejected), MUST default `isActive` to `true`, and MUST validate max text lengths and email format when provided.

#### Scenario: Valid customer creation

- GIVEN an authenticated session
- WHEN a valid payload (name, optional documentNumber/email/phone/address/notes) is submitted
- THEN the customer is created under the session's `business_id` with `isActive = true`

#### Scenario: Client-supplied business_id rejected

- GIVEN an authenticated session
- WHEN the payload includes a `business_id` field
- THEN the request is rejected with `VALIDATION_ERROR` (unknown field) or the field is ignored and the session's `business_id` is used

### Requirement: Customer Detail With Financial Summary

`GET /api/customers/{id}` MUST return the customer plus server-computed total invoiced, total paid, pending balance, recent invoices, and recent payments — all filtered to the same `business_id`.

#### Scenario: Detail for own-business customer

- GIVEN a customer belonging to business B1
- WHEN a B1 session requests the detail
- THEN the response includes totals/balance computed from B1's invoices and payments only

#### Scenario: Detail for another business's customer

- GIVEN a customer id belonging to business B2
- WHEN a B1 session requests that id
- THEN the response is `NOT_FOUND` — existence is never revealed across businesses

### Requirement: Update Customer

`PATCH /api/customers/{id}` MUST allow only descriptive fields and `isActive`; MUST reject `business_id`, balances, and audit fields; MUST reject empty payloads or unknown fields; MUST verify the customer belongs to the session's `business_id`.

#### Scenario: Valid descriptive update

- GIVEN a customer of business B1
- WHEN a B1 session submits an update to name/phone/isActive
- THEN the update is applied

#### Scenario: Sensitive field rejected

- GIVEN a customer of business B1
- WHEN a B1 session submits a payload containing `business_id` or a balance field
- THEN the request is rejected with `VALIDATION_ERROR`

### Requirement: business_id Scoping (RLS-Equivalent)

Every customer read and write MUST filter/validate against `business_id` resolved from the session. The mock service layer enforces this today; it is the functional equivalent of the future RLS policy restricting `customers` rows to their owning `business_id`.

#### Scenario: Mock service layer enforces scoping

- GIVEN any customer query or mutation
- WHEN it executes against the mock store
- THEN it is filtered by the session's `business_id`, standing in for RLS until Supabase is introduced
