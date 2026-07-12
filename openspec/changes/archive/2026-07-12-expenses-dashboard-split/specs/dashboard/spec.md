# Delta for Dashboard

## MODIFIED Requirements

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

## ADDED Requirements

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
