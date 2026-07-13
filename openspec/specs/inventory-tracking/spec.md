# Inventory Tracking Specification

## Purpose

Let any authenticated user maintain a per-business product catalog and record
in/out stock movements, with quantity and value always **computed** from an
append-only movement ledger — never a stored, driftable column — mirroring
how `invoices.balance`/`status` are computed from `payments`.

## Requirements

### Requirement: Products Are Business-Scoped and Editable

`products` MUST store `business_id`, `name`, `sku` (optional), `unit_cost`
(positive integer minor units), `min_stock_threshold` (non-negative integer),
`active` (boolean, default `true`), `created_at`, `updated_at`. Every
read/write MUST filter/validate against `business_id` resolved from the
session, never a client-supplied value. Name, sku, unit_cost,
min_stock_threshold, and active MUST be editable via update; there is no
delete — only the active toggle.

#### Scenario: Create product under session business

- GIVEN an authenticated session for business B1
- WHEN a valid product payload (name, unit_cost, min_stock_threshold) is submitted
- THEN the product is created under B1 with `active = true`

#### Scenario: Update editable fields

- GIVEN a product belonging to business B1
- WHEN a B1 session submits an update to name, sku, unit_cost, min_stock_threshold, or active
- THEN the update is applied and no delete operation is offered

#### Scenario: Cross-business isolation

- GIVEN a product exists under business B2
- WHEN a B1 session lists or fetches products
- THEN the B2 product never appears and fetching it directly returns not-found

### Requirement: SKU Is Optional Free Text

`sku` MUST be optional and, when provided, MUST be stored as free text with a
reasonable maximum length. The system MUST NOT enforce any uniqueness
constraint on `sku`, matching this codebase's permissive text-field
convention for similar identifiers (e.g. `customers.documentNumber`, which is
also optional and unenforced for uniqueness).

#### Scenario: Product created without sku

- GIVEN a product payload with no `sku` field
- WHEN it is submitted
- THEN the product is created with `sku` stored as null/absent

#### Scenario: Duplicate sku within the same business is accepted

- GIVEN a product with `sku: "ABC123"` already exists under business B1
- WHEN another B1 product is created with the same `sku: "ABC123"`
- THEN the creation succeeds; no uniqueness error is raised

### Requirement: Inventory Movements Are Business-Scoped and Append-Only

`inventory_movements` MUST store `business_id`, `product_id` (FK), `type`
(`in` or `out`), `quantity` (positive integer), optional `notes`, and
`created_at`. There MUST be no update or delete operation on
`inventory_movements` — once created, a movement record is permanent.

#### Scenario: Movement created, no edit path exists

- GIVEN an inventory movement has been created
- WHEN any caller attempts to update or delete it
- THEN no such operation exists in the repository, service, or API surface

#### Scenario: Cross-business isolation

- GIVEN a movement exists under business B2
- WHEN a B1 session lists movements
- THEN the B2 movement never appears

### Requirement: Positive Integer Movement Quantity

`inventory_movements.quantity` MUST be a positive integer. Zero, negative, or
non-integer quantities MUST be rejected before persistence.

#### Scenario: Zero or negative quantity rejected

- GIVEN a movement payload with `quantity: 0` or a negative value
- WHEN it is submitted
- THEN the request is rejected with `VALIDATION_ERROR` and no row is persisted

### Requirement: Computed Quantity and Value, Never Stored

A product's current quantity and total value MUST always be computed at read
time by summing its movements (`in` adds, `out` subtracts quantity; total
value is computed quantity times `unit_cost`). `products` MUST NOT persist a
quantity or value column; every list/detail read recomputes both from
`inventory_movements`.

#### Scenario: Quantity reflects movement history

- GIVEN a product with an `in` movement of 10 and an `out` movement of 3
- WHEN the product is read
- THEN its computed quantity is 7 and total value is `7 * unit_cost`

#### Scenario: No stored quantity column exists

- GIVEN the `products` table schema
- WHEN it is inspected
- THEN it contains no quantity or total-value column of any kind

### Requirement: Floor-at-Zero Atomic Guard on Out Movements

An `out` movement that would reduce a product's computed quantity below zero
MUST be rejected atomically with zero mutation — no partial movement is ever
recorded — mirroring `payment-repo.ts`'s overpay-rejection pattern exactly
(locked read-check-write in mock; two-statement guarded transaction in
Postgres — see Implementation Note below).

#### Scenario: Out movement within stock succeeds

- GIVEN a product with computed quantity 5
- WHEN an `out` movement of quantity 5 is recorded
- THEN it succeeds and computed quantity becomes 0

#### Scenario: Out movement exceeding stock is rejected with zero mutation

- GIVEN a product with computed quantity 5
- WHEN an `out` movement of quantity 6 is submitted
- THEN the request is rejected with `VALIDATION_ERROR` and no movement row is persisted

**Implementation Note (empirically verified concurrency fix)**: the initial
Postgres implementation used a single `FOR UPDATE`-in-CTE statement (lock the
`products` row and SUM the `inventory_movements` ledger in one correlated
subquery). This was **empirically disproven** against a real Postgres 16
container — two concurrent `out` movements both succeeded, driving computed
stock negative (-4), reproduced 3/3 runs. Root cause: Postgres' EvalPlanQual
only re-checks the locked row's own columns when a statement resumes after a
lock wait; a correlated subquery over a *different* table in the same
statement is not re-evaluated with a fresh snapshot. The shipped fix uses a
genuine **two-statement `sql.transaction([...])`**: statement 1
(`SELECT ... FOR UPDATE`) acquires and holds the row lock for the whole
transaction; statement 2 (the SUM-guarded `INSERT`) runs second, taking a
fresh READ COMMITTED snapshot only after the lock resolves. Verified 3/3
against real Postgres 16 for both the bug reproduction and the fix's
correctness (exactly one of two concurrent `out` movements succeeds, zero
mutation on the rejected one). See `lib/db/inventory-repo.ts`'s doc comment
for the full methodology.

### Requirement: Per-Product Low-Stock Flag

A product's report row MUST be flagged as low-stock when its own computed
quantity is below its own `min_stock_threshold`. This comparison MUST use
each product's individual threshold, never a global or shared value.

#### Scenario: Product below its own threshold is flagged

- GIVEN a product with `min_stock_threshold: 10` and computed quantity 4
- WHEN the product report is read
- THEN the product's row is flagged low-stock

#### Scenario: Different products use different thresholds independently

- GIVEN product A with `min_stock_threshold: 10` and quantity 8, and product B with `min_stock_threshold: 5` and quantity 8
- WHEN the report is read
- THEN A is flagged low-stock and B is not, despite both having the same quantity

### Requirement: Movement Note Is Optional

`notes` on an inventory movement MUST be optional, matching `notes` being
optional on Expense/Payment/PayrollPayment throughout this codebase.

#### Scenario: Movement created without notes

- GIVEN a movement payload with no `notes` field
- WHEN it is submitted
- THEN the movement is created with `notes` stored as null

### Requirement: Movement-Recording UI Offers Active Products Only

The "Registrar movimiento" product select MUST only offer active products,
mirroring Nomina's `payroll-payment-form-dialog-content.tsx` employee select,
which only offers active employees.

#### Scenario: Inactive product excluded from movement form

- GIVEN business B1 has one active and one inactive product
- WHEN the "Registrar movimiento" form's product select is rendered
- THEN only the active product appears as an option

### Requirement: No Role Gating on Inventory

Any authenticated user, regardless of role, MUST be able to view and use
Inventario (products and movements) — unlike Nomina's admin-only restriction.

#### Scenario: Non-admin session accesses Inventario

- GIVEN an authenticated session with a non-admin role
- WHEN the user opens `/inventario` or calls `/api/products`/`/api/inventory-movements`
- THEN access is granted; no capability check blocks the request

### Requirement: business_id Scoping (RLS-Equivalent)

Every product and movement read/write MUST filter/validate against
`business_id` resolved from the session. The mock service layer enforces this
today as the functional equivalent of the future RLS policies on `products`
and `inventory_movements`.

#### Scenario: Mock service layer enforces scoping

- GIVEN any product or movement query or mutation
- WHEN it executes against the mock store
- THEN it is filtered by the session's `business_id`
