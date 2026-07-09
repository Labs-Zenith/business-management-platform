# Dashboard Delta

## MODIFIED Requirements

### Requirement: Dashboard Screen Content and Actions

The dashboard screen MUST display pending balance, payments this month, overdue invoices, recent payments, and top debtors by pending balance, MUST offer "Create Customer" and "Create Invoice" actions, and SHOULD include visual chart cards that summarize receivables, debtor concentration, and payment activity.

#### Scenario: Owner opens dashboard

- GIVEN an authenticated session
- WHEN the user opens the dashboard
- THEN all five summary elements are visible
- AND both quick actions are reachable
- AND visual chart cards summarize the same business-scoped financial data

## ADDED Requirements

### Requirement: Business-Scoped Dashboard Chart Data

Dashboard chart data MUST be derived server-side from invoices, payments, and customers belonging only to the session's resolved `business_id`. Chart data MUST use the same recomputed invoice status and balance rules as existing dashboard aggregates.

#### Scenario: Chart data excludes another business

- GIVEN a session for business B1 with invoices/payments/customers in B1 and separate data in business B2
- WHEN dashboard chart data is computed
- THEN every chart series and total is derived only from B1 data
- AND B2 data never influences chart labels, counts, or amounts

### Requirement: Visual Dashboard Responsiveness

Dashboard chart cards MUST be readable on mobile and desktop. On mobile, chart sections MUST stack vertically; on larger screens, chart sections MAY use multi-column layout.

#### Scenario: Dashboard viewed on a phone

- GIVEN an authenticated user on a narrow viewport
- WHEN the dashboard renders
- THEN KPI cards, chart cards, and quick actions are reachable without page-level horizontal overflow
