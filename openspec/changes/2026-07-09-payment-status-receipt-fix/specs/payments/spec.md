# Payments Delta

## ADDED Requirements

### Requirement: Overdue Invoice Becomes Partially Paid After Abono

When a valid partial payment is registered against an overdue invoice, the returned invoice and persisted invoice status MUST become `partially_paid`, not remain `overdue`.

#### Scenario: Register partial payment on overdue invoice

- GIVEN an overdue invoice with balance greater than zero and no payments
- WHEN a valid partial payment is registered
- THEN the invoice balance decreases
- AND the invoice status is `partially_paid`
