# Inventory Tracking Delta

## MODIFIED Requirements

### Requirement: Products Are Business-Scoped and Editable

The previous wording stated that products have no delete and only the `active` toggle. Products are now deletable; the `active` toggle remains as the non-destructive alternative.

#### Scenario: Update editable fields

- GIVEN an authenticated session and a product in that business
- WHEN the user updates name, sku, unit cost or active state
- THEN the product is updated
- AND the delete operation is offered separately, gated on `deleteRecords`

## ADDED Requirements

### Requirement: Delete Product Only When Never Invoiced

The system MUST allow an admin to permanently delete a product only when zero `invoice_items` rows reference it. Otherwise the delete MUST be refused with `CONFLICT`, naming how many DISTINCT invoices reference it and suggesting deactivation instead. When allowed, the delete MUST remove the product's `inventory_movements` rows and the product in a single transaction.

#### Scenario: Delete a product that was never sold

- GIVEN an authenticated admin session and a product with no invoice lines
- WHEN the admin confirms the deletion
- THEN the product and its inventory movements are removed
- AND the row disappears from the Inventario list

#### Scenario: Delete refused for a product that has been invoiced

- GIVEN an authenticated admin session and a product appearing on one invoice
- WHEN the admin confirms the deletion
- THEN the response is `409 CONFLICT`
- AND the message names the invoice count and suggests deactivating instead
- AND the product, the invoice and its line are all left untouched
- AND the confirmation dialog stays open showing that message inline

#### Scenario: One invoice selling the product on two lines counts once

- GIVEN a product sold twice on the SAME invoice
- WHEN a delete is attempted
- THEN the refusal names 1 invoice, not 2

#### Scenario: Refusal offers deactivation as the way forward

- GIVEN a delete refused with `CONFLICT` for an ACTIVE product
- WHEN the dialog renders the refusal
- THEN a "Desactivar" button replaces the destructive confirm button
- AND clicking it sets `active` to false and closes the dialog
- AND the button is NOT offered when the product is already inactive, nor for non-`CONFLICT` failures

#### Scenario: Cross-business delete attempt

- GIVEN an authenticated admin session
- WHEN a delete targets a product belonging to a different business
- THEN the response is `NOT_FOUND`
- AND that product is left untouched

#### Scenario: Worker attempts to delete

- GIVEN an authenticated session whose role is `worker`
- WHEN a delete is issued for a product in that business
- THEN the response is `403 FORBIDDEN` before any repository call
- AND the delete button is not rendered for that session

### Requirement: Out-of-Stock Products Cannot Be Picked When Creating an Invoice

When creating an invoice, the system MUST label a product whose computed quantity is zero as "sin stock" and prevent selecting it, and MUST flag a line whose quantity exceeds the available stock before submission. The quantity claimed across ALL lines of the same product MUST be summed, because they draw from one balance. The server remains the authority.

#### Scenario: Selling the entire stock then attempting one more

- GIVEN a product with a computed quantity of 2
- WHEN an invoice sells 2 units
- THEN the product's computed quantity becomes 0
- AND on a new invoice that product is offered as "sin stock" and cannot be selected

#### Scenario: Quantity above the available stock

- GIVEN a product with a computed quantity of 3 selected on an invoice line
- WHEN the user types a quantity of 4
- THEN an inline message states that only 3 are in stock

#### Scenario: Editing an existing invoice is not stock-restricted client-side

- GIVEN an invoice being edited whose own lines already consumed the stock
- WHEN the edit form renders
- THEN out-of-stock products are NOT disabled and no over-draw warning is shown
- BECAUSE the server reverses the invoice's prior movements before re-applying the new lines

#### Scenario: Server rejects an over-draw with zero mutation

- GIVEN a product with a computed quantity of 1
- WHEN an invoice request claims 5 units of it
- THEN the response is `VALIDATION_ERROR` mentioning insufficient stock
- AND no invoice is persisted
- AND the product's computed quantity is still 1
