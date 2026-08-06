# Invoices Delta

## ADDED Requirements

### Requirement: Void an Invoice

The system MUST let an admin void an invoice, marking it logically deleted WITHOUT removing the row, its number or its line items. Voiding MUST, in a single transaction, reverse the inventory its product lines moved, void its payments, and record when, by whom and why. A failure at any step MUST leave the invoice untouched.

#### Scenario: Voiding a paid sale returns the stock and the money

- GIVEN a product with 10 units and a sale of 4 of them, with a payment recorded
- WHEN an admin voids that invoice with a reason
- THEN the product's computed quantity returns to 10
- AND the invoice reports status "voided" with paid amount and balance both 0
- AND the customer's balance, total invoiced and total paid all return to 0
- AND the invoice row, its items and its payments all still exist, marked voided

#### Scenario: Voiding a credit note takes back what it returned

- GIVEN a credit note that returned 3 units to stock
- WHEN it is voided
- THEN those 3 units are removed from stock again

#### Scenario: Voiding is refused when the returned units were already re-sold

- GIVEN a credit note that returned 2 units which have since been sold again
- WHEN it is voided
- THEN the response is `VALIDATION_ERROR` naming the affected line
- AND nothing changes: the stock, the payments and the invoice are all untouched

#### Scenario: A reason is mandatory

- WHEN a void is attempted with an empty or whitespace-only reason
- THEN the response is `VALIDATION_ERROR` and the invoice stays live

#### Scenario: Voiding twice is refused

- GIVEN an already voided invoice
- WHEN it is voided again
- THEN the response is `409 CONFLICT`

### Requirement: A Voided Invoice Is Frozen and Excluded

A voided invoice MUST count toward nothing and accept no further changes.

#### Scenario: Excluded from the default listing but reachable

- WHEN the invoice list is read without a status filter
- THEN voided invoices do not appear
- AND filtering by status "voided" returns them, badged "Anulada"

#### Scenario: Cannot be edited or paid

- GIVEN a voided invoice
- WHEN an edit or a payment is attempted against it
- THEN both are refused with `CONFLICT`
- AND the "Editar factura" and "Registrar pago" actions are not rendered

#### Scenario: Contributes to no figure

- GIVEN a voided invoice that had a total and payments
- THEN it contributes nothing to the customer's balance, the dashboard totals or the exports
