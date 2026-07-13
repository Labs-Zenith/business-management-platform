# Payroll Management Specification

## Purpose

Let an `admin` register employees and record payroll payments, each of which
atomically creates a linked `category:'nomina'` expense so payroll appears in
the dashboard's Egresos tab with zero double entry.

## Requirements

### Requirement: Employees Are Business-Scoped and Editable

`employees` MUST store `business_id`, `name`, `base_salary` (integer minor
units), `active` (boolean), `created_at`, `updated_at`. Every read/write MUST
filter/validate against `business_id` resolved from the session, never a
client-supplied value. Name, base salary, and active MUST be editable via
update; there is no delete — only the active toggle.

#### Scenario: Create employee under session business

- GIVEN an authenticated `admin` session for business B1
- WHEN a valid employee payload (name, base_salary) is submitted
- THEN the employee is created under B1 with `active = true`

#### Scenario: Update editable fields

- GIVEN an employee belonging to business B1
- WHEN a B1 `admin` session submits an update to name, base_salary, or active
- THEN the update is applied and no delete operation is offered

#### Scenario: Cross-business isolation

- GIVEN an employee exists under business B2
- WHEN a B1 session lists or fetches employees
- THEN the B2 employee never appears and fetching it directly returns not-found

### Requirement: Payroll Payments Are Business-Scoped and Append-Only

`payroll_payments` MUST store `business_id`, `employee_id` (FK), `amount`
(positive integer minor units), `period_type` (`quincenal` or `mensual`),
`period_start`, `period_end` (dates), `payment_date`, optional `notes`, and
`created_at`. There MUST be no update or delete operation on
`payroll_payments` — once created, a payment record is permanent.

#### Scenario: Payment created, no edit path exists

- GIVEN a payroll payment has been created
- WHEN any caller attempts to update or delete it
- THEN no such operation exists in the repository, service, or API surface

#### Scenario: Cross-business isolation

- GIVEN a payroll payment exists under business B2
- WHEN a B1 session lists payroll payments
- THEN the B2 payment never appears

### Requirement: Positive Integer Amount (Minor Units)

`payroll_payments.amount` MUST be a positive integer in minor currency units.
Zero, negative, or non-integer amounts MUST be rejected before persistence.

#### Scenario: Zero or negative amount rejected

- GIVEN a payroll payment payload with `amount: 0` or a negative value
- WHEN it is submitted
- THEN the request is rejected with `VALIDATION_ERROR` and no row is persisted

#### Scenario: Non-integer amount rejected

- GIVEN a payroll payment payload with a fractional `amount`
- WHEN it is submitted
- THEN the request is rejected with `VALIDATION_ERROR`

### Requirement: Period Type Determines Computed Period Range

Given `period_type` and a reference date, the system MUST deterministically
derive `period_start`/`period_end`: `mensual` spans the 1st to the last day of
the reference month; `quincenal` spans the 1st–15th (first half) or the
16th–last-day (second half) of the reference month, depending on which half
the reference date falls in. The system MUST NOT persist a day-count field —
day count is always derivable as `period_end - period_start + 1`.

#### Scenario: Mensual spans full calendar month

- GIVEN `period_type: "mensual"` and a reference date of `2026-02-10`
- WHEN the period is computed
- THEN `period_start = 2026-02-01` and `period_end = 2026-02-28`

#### Scenario: Quincenal first half

- GIVEN `period_type: "quincenal"` and a reference date of `2026-07-05`
- WHEN the period is computed
- THEN `period_start = 2026-07-01` and `period_end = 2026-07-15`

#### Scenario: Quincenal second half across a 31-day month

- GIVEN `period_type: "quincenal"` and a reference date of `2026-07-20`
- WHEN the period is computed
- THEN `period_start = 2026-07-16` and `period_end = 2026-07-31`

#### Scenario: Quincenal second half across a leap-year February

- GIVEN `period_type: "quincenal"` and a reference date of `2028-02-20`
- WHEN the period is computed
- THEN `period_start = 2028-02-16` and `period_end = 2028-02-29`

### Requirement: Atomic Payment-to-Expense Linkage

`createPayrollPayment` MUST create the `payroll_payments` row AND a linked
`category:'nomina'` expense (via the reusable expense-creation path) as a
single all-or-nothing operation. If either insert fails, neither MUST
persist.

#### Scenario: Successful payment creates both records

- GIVEN a valid payroll payment payload
- WHEN `createPayrollPayment` is called
- THEN a `payroll_payments` row is persisted AND a matching `category:'nomina'`
  expense is persisted, and the expense is visible in the Egresos tab

#### Scenario: Expense insert fails, payment row does not persist

- GIVEN a valid payroll payment payload
- WHEN the linked expense insert fails for any reason
- THEN the `payroll_payments` row is NOT persisted either — no partial state
  remains

#### Scenario: Payment insert fails, expense does not persist

- GIVEN a valid payroll payment payload
- WHEN the `payroll_payments` insert fails for any reason
- THEN no `category:'nomina'` expense is created either

### Requirement: No Correction or Void Path

The system MUST NOT offer any correction, void, or compensating-entry
operation for a mistaken payroll payment or its linked expense in this phase.
A mistaken entry remains as a permanent historical record.

#### Scenario: No void endpoint exists

- GIVEN a payroll payment was created in error
- WHEN an admin looks for a way to void or correct it
- THEN no void/correct/delete operation exists for payroll payments or their
  linked expenses
