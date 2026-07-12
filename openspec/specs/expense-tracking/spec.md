# Expense Tracking Specification

## Purpose

Track discretionary and payroll-related business expenses, scoped to the authenticated business, with a reusable creation path so future automated callers (e.g. a Nomina payroll module) can insert expenses directly, without going through the HTTP layer.

## Requirements

### Requirement: Business-Scoped Expense Schema

The `expenses` table MUST store `business_id`, `category`, `description`, `amount`, `date`, and optional `notes`, and MUST NEVER persist a client-supplied `business_id` — it is always resolved server-side from the session.

#### Scenario: Client-supplied business_id ignored

- GIVEN an authenticated session for business B1
- WHEN an expense payload includes a `business_id` field
- THEN the persisted expense's `business_id` is B1, derived from the session; any client value is ignored or rejected

### Requirement: Expense Category Constraint

`category` MUST be restricted to `nomina` or `otro`. The database MUST enforce this via a `TEXT + CHECK` constraint (mirroring the invoices/payments convention), and the service layer MUST reject any other value before persistence.

#### Scenario: Invalid category rejected

- GIVEN an expense payload with `category: "viajes"`
- WHEN the expense is submitted
- THEN the request is rejected with `VALIDATION_ERROR` and no row is persisted

#### Scenario: Both valid categories accepted

- GIVEN payloads with `category: "nomina"` and `category: "otro"`
- WHEN each is submitted
- THEN both are accepted and persisted

### Requirement: Positive Integer Amount (Minor Units)

`amount` MUST be a positive integer representing minor currency units (cents), consistent with the invoices/payments money representation. Zero, negative, or non-integer amounts MUST be rejected.

#### Scenario: Zero amount rejected

- GIVEN an expense payload with `amount: 0`
- WHEN it is submitted
- THEN the request is rejected with `VALIDATION_ERROR`

#### Scenario: Non-integer amount rejected

- GIVEN an expense payload with a fractional `amount`
- WHEN it is submitted
- THEN the request is rejected with `VALIDATION_ERROR`

### Requirement: Reusable createExpense Service Function

`createExpense` MUST be a plain, route-independent service function accepting a resolved `business_id` and expense data as arguments, so future callers (e.g. an automated Nomina payroll insert) can invoke it directly.

#### Scenario: Route delegates to service

- GIVEN `POST /api/expenses` receives a valid payload
- WHEN the request is processed
- THEN the route resolves `business_id` from the session and calls `createExpense(business_id, data)`; no expense-creation logic lives in the route handler

#### Scenario: Non-route caller creates an expense

- GIVEN a caller outside the HTTP request lifecycle with an already-resolved `business_id`
- WHEN it calls `createExpense(business_id, data)` directly with `category: "nomina"`
- THEN the expense is created identically to one created through the API route

### Requirement: List Expenses Scoped to Business

`GET /api/expenses` MUST return only expenses whose `business_id` matches the session, MUST support optional `category`, `from`, `to`, `page` (min 1), and `pageSize` (max 50).

#### Scenario: Filtered list

- GIVEN an authenticated session for business B1
- WHEN `GET /api/expenses?category=nomina&from=2026-07-01&to=2026-07-31` is called
- THEN only B1 expenses in that category and date range are returned

#### Scenario: Cross-business isolation on list

- GIVEN an expense exists under business B2
- WHEN a B1 session lists expenses with any filter values
- THEN the B2 expense never appears in the response

### Requirement: Create Expense Endpoint

`POST /api/expenses` MUST require `category`, `description`, `amount`, and `date`; MUST derive `business_id` from the session; and MUST reject any client-supplied `business_id`.

#### Scenario: Valid expense creation

- GIVEN an authenticated session
- WHEN a valid payload (`category`, `description`, `amount`, `date`, optional `notes`) is submitted
- THEN the expense is created under the session's `business_id`

### Requirement: Crear Gasto Manual Entry Form

The UI MUST offer a "Crear gasto" form (category, description, amount, date) for manual expense entry, mirroring the invoice/payment create-form pattern, with client-side validation matching the server's Zod schema plus server-side re-validation on submit.

#### Scenario: Valid manual submission

- GIVEN an authenticated user on the Egresos tab
- WHEN they fill the "Crear gasto" form with valid values and submit
- THEN a new expense is created and appears in the recent expenses list without a full page reload

#### Scenario: Client-side validation blocks invalid submission

- GIVEN the "Crear gasto" form
- WHEN the user submits with `amount <= 0` or a missing required field
- THEN the form displays a validation error and no request is sent to the server

### Requirement: business_id Scoping (RLS-Equivalent)

Every expense read and write MUST filter/validate against `business_id` resolved from the session. The mock service layer enforces this today as the functional equivalent of the future RLS policy restricting `expenses` to their owning `business_id`.

#### Scenario: Mock service layer enforces scoping

- GIVEN any expense query or mutation
- WHEN it executes against the mock store
- THEN it is filtered by the session's `business_id`
