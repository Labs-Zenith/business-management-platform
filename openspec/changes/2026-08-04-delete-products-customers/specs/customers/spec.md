# Customers Delta

## ADDED Requirements

### Requirement: Delete Customer Only When Unreferenced

The system MUST allow an admin to permanently delete a customer only when zero invoices AND zero payments reference them. Otherwise the delete MUST be refused with `CONFLICT` and a message naming how many invoices and payments reference the customer and suggesting deactivation instead. On success, `pipeline_cards.customer_id` MUST be set to `NULL` in the same transaction.

#### Scenario: Delete a customer with no financial history

- GIVEN an authenticated admin session and a customer with no invoices or payments
- WHEN the admin confirms the deletion
- THEN the customer is removed
- AND any pipeline card that referenced them survives with its customer link cleared

#### Scenario: Delete refused for a customer with invoices

- GIVEN an authenticated admin session and a customer with one invoice
- WHEN the admin confirms the deletion
- THEN the response is `409 CONFLICT`
- AND the message names the invoice count and suggests deactivating instead
- AND the customer, the invoice and its payments are all left untouched
- AND the confirmation dialog stays open showing that message inline

#### Scenario: Refusal offers deactivation as the way forward

- GIVEN a delete refused with `CONFLICT` for an ACTIVE customer
- WHEN the dialog renders the refusal
- THEN a "Desactivar" button replaces the destructive confirm button
- AND clicking it sets `isActive` to false and refreshes in place, WITHOUT navigating away
- BECAUSE deactivating leaves the customer in place, so the detail page stays valid

#### Scenario: Delete from the customer detail page

- GIVEN an authenticated admin session on a customer's detail page
- WHEN the deletion succeeds
- THEN the app navigates back to the customer list
- BECAUSE remaining on the detail page of a deleted customer would 404

#### Scenario: Cross-business delete attempt

- GIVEN an authenticated admin session
- WHEN a delete targets a customer belonging to a different business
- THEN the response is `NOT_FOUND` — never `CONFLICT`, which would reveal existence

#### Scenario: Worker attempts to delete

- GIVEN an authenticated session whose role is `worker`
- WHEN a delete is issued for a customer in that business
- THEN the response is `403 FORBIDDEN` before any repository call
- AND the delete button is not rendered for that session
