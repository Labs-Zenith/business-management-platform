# Receipts Specification

## Purpose

Provide printable views for internal invoices and payment receipts, each carrying the mandatory non-fiscal legal notice, scoped to the authenticated business.

## Requirements

### Requirement: Printable Invoice Comprobante

The system MUST provide a printable view of an invoice showing business data, customer data, invoice number, items, values, dates, and the current computed total/balance/status, scoped to the invoice's own `business_id`.

#### Scenario: Print own-business invoice

- GIVEN an invoice belonging to business B1
- WHEN a B1 session opens its printable view
- THEN the view renders business data, customer data, items, total, balance, status, and dates

#### Scenario: Print another business's invoice denied

- GIVEN an invoice belonging to business B2
- WHEN a B1 session requests its printable view
- THEN access is denied (not found), consistent with cross-tenant isolation

### Requirement: Printable Payment Receipt

The system MUST provide a printable receipt for a registered payment, showing business data, customer data, a payment reference, amount, date, and method, scoped to the payment's own `business_id`.

#### Scenario: Print own-business payment receipt

- GIVEN a payment belonging to business B1
- WHEN a B1 session opens its printable receipt
- THEN the view renders business data, customer data, amount, date, and method

### Requirement: Mandatory Legal Notice

Every printable comprobante (invoice or payment receipt) MUST display, verbatim and prominently, the notice: "Documento interno, no valido como factura electronica DIAN." This notice MUST NOT be omitted or made optional.

#### Scenario: Notice present on every printable view

- GIVEN any printable invoice or payment receipt view
- WHEN it is rendered
- THEN the DIAN legal notice text is visible on the page

### Requirement: business_id Scoping (RLS-Equivalent)

Receipt data retrieval MUST filter by `business_id` resolved from the session, consistent with the invoices and payments capabilities' scoping rules — the functional equivalent of the future RLS enforcement on those tables.

#### Scenario: Mock service layer enforces scoping

- GIVEN a request for a printable view
- WHEN the underlying invoice or payment is fetched
- THEN it is filtered by the session's `business_id` before rendering
