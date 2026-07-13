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

The dashboard screen MUST display, within an **Ingresos** tab, pending balance, payments this month, overdue invoices, recent payments, and top debtors by pending balance, and MUST offer "Create Customer" and "Create Invoice" actions — all unchanged from prior behavior. The dashboard screen MUST also display, within a separate **Egresos** tab, total expenses this month, an expenses-by-category breakdown (Nómina / Otro), and a recent expenses list, and MUST offer a "Crear gasto" action. Both tabs MUST be reachable from a single dashboard page without a full navigation/reload.
(Previously: single-section screen with only Ingresos content; no tab structure.)

#### Scenario: Owner opens dashboard (Ingresos unchanged)

- GIVEN an authenticated session
- WHEN the user opens the dashboard on the Ingresos tab
- THEN all five original summary elements are visible and both original quick actions are reachable, unchanged from prior behavior

#### Scenario: Owner switches to Egresos tab

- GIVEN an authenticated session on the dashboard
- WHEN the user switches to the Egresos tab
- THEN total expenses this month, the by-category breakdown, and the recent expenses list are visible, and the "Crear gasto" action is reachable

### Requirement: Egresos Tab Business-Scoped Aggregates

The Egresos tab MUST display `totalThisMonth`, `byCategory` (per-category totals for `nomina` and `otro`), and `recentExpenses`, computed server-side at request time exclusively from expenses belonging to the session's resolved `business_id`.

#### Scenario: Egresos reflects only own business

- GIVEN a session for business B1 with expenses in B1 and other expenses in business B2
- WHEN the Egresos tab is loaded
- THEN every figure is derived only from B1 expenses; B2 expenses never influence the result

### Requirement: Egresos Independent Suspense Streaming

Each Egresos section (total this month, by-category, recent list) MUST stream independently via its own `<Suspense>` boundary, matching the existing Ingresos sections' streaming pattern, and MUST NOT block the Ingresos tab's render.

#### Scenario: Egresos section loads independently of Ingresos

- GIVEN the dashboard page is rendering both tabs
- WHEN one Egresos data fetch is slower than the Ingresos fetches
- THEN the Ingresos tab's content still renders/streams without waiting on the slow Egresos section

### Requirement: Egresos Empty State

When a business has no expenses, the Egresos tab MUST show a zero/empty-state treatment (zero totals, empty category breakdown, empty recent list) consistent with existing dashboard empty-state conventions, rather than an error.

#### Scenario: New business with no expenses

- GIVEN a business with zero expense rows (e.g. freshly seeded via `seedMinimal`)
- WHEN the Egresos tab is loaded
- THEN totals show zero, the by-category breakdown shows zero for both categories, and the recent list is empty; no error is shown

### Requirement: Dashboard Full Export (Excel + PDF)

`GET /api/dashboard/export?format=xlsx|pdf` MUST require an authenticated session (any role — no additional role/permission gating beyond what the dashboard already enforces) and MUST return the complete dashboard dataset for the session's resolved `business_id`, computed server-side at request time. The export MUST cover ALL sections of BOTH tabs, with no filters or date ranges:

- **Ingresos**: KPIs (pending balance, paid this month, overdue count), `saldo por estado`, `mayores saldos`, `pagos por mes`, `facturas vencidas`, `mayores deudores`, `pagos recientes`.
- **Egresos**: KPIs (total this month), `gastos por categoria`, `gastos recientes`.

The export MUST introduce no new business logic, schema changes, or capability/permission — it is a pure read-and-format aggregation of existing dashboard service functions. Category labels MUST match the dashboard exactly (accents intact), reusing the existing label source rather than duplicating it.

#### Scenario: Excel export contains one sheet per section

- GIVEN an authenticated session for business B1 with dashboard data in B1
- WHEN `GET /api/dashboard/export?format=xlsx` is called
- THEN the response has status 200, `Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`, and a `Content-Disposition: attachment` header naming a `.xlsx` file
- AND the workbook contains one sheet per dashboard section covering both tabs, each with a header row styled via the existing `styleHeader` convention, populated only from B1 data

#### Scenario: PDF export is a single flowing multi-section report

- GIVEN an authenticated session for business B1
- WHEN `GET /api/dashboard/export?format=pdf` is called
- THEN the response has status 200, `Content-Type: application/pdf`, and a `Content-Disposition: attachment` header naming a `.pdf` file
- AND the document is one continuous report with a heading and table per section for both tabs (not one page per section), flowing across page breaks as needed

#### Scenario: Invalid or missing format is rejected

- GIVEN an authenticated session
- WHEN `GET /api/dashboard/export` is called with a missing `format` param or a value other than `xlsx`/`pdf`
- THEN the request is rejected with a `VALIDATION_ERROR` (HTTP 400), matching the existing `parseExportFormat` behavior used by the invoices export route
- AND no export file is produced

#### Scenario: Empty-state business still exports successfully

- GIVEN an authenticated session for a business with zero invoices, payments, and expenses
- WHEN the dashboard export is requested in either format
- THEN the export is produced successfully (status 200) with every section present but empty/zero (zero KPIs, empty category and list sections), never an error
