# Dashboard Specification

## Purpose

Give the business owner immediate visibility into pending balance, monthly payments, overdue invoices, recent payments, and top debtors — always computed for their own business only.

## Requirements

### Requirement: Business-Scoped Summary Endpoint

`GET /api/dashboard/summary` MUST return `pendingBalance`, `paidThisMonth`, `overdueInvoices` (count), `recentPayments`, and `topDebtors`, computed exclusively from the invoices/payments belonging to the session's resolved `business_id`.

#### Scenario: Summary reflects only own business

- GIVEN a session for business B1 with invoices/payments in B1 and other data in business B2
- WHEN `GET /api/dashboard/summary` is called
- THEN every returned figure is derived only from B1 data; B2 data never influences the response

### Requirement: Computed, Not Stale, Aggregates

All dashboard figures MUST be computed server-side at request time from current invoice/payment state, using the same status and balance computation rules as the invoices capability — never served from stale persisted fields.

#### Scenario: Newly overdue invoice reflected immediately

- GIVEN an invoice whose `due_date` passed since the dashboard was last viewed
- WHEN the summary is requested again
- THEN `overdueInvoices` includes that invoice without requiring any separate recompute step

### Requirement: business_id Scoping (RLS-Equivalent)

Every underlying query used to build the dashboard summary MUST filter by `business_id` resolved from the session. The mock service layer enforces this today as the functional equivalent of the future RLS policies on `invoices`, `payments`, and `customers`.

#### Scenario: Mock service layer enforces scoping

- GIVEN the dashboard summary computation
- WHEN it aggregates invoices, payments, and customers
- THEN each underlying query is filtered by the session's `business_id`

### Requirement: Dashboard Screen Content and Actions

The dashboard screen MUST display pending balance, payments this month, overdue invoices, recent payments, and top debtors by pending balance, and MUST offer "Create Customer" and "Create Invoice" actions.

#### Scenario: Owner opens dashboard

- GIVEN an authenticated session
- WHEN the user opens the dashboard
- THEN all five summary elements are visible and both quick actions are reachable
