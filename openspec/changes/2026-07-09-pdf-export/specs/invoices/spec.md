# Invoices Delta

## ADDED Requirements

### Requirement: Export Filtered Invoices

The system MUST export invoices matching the current invoice list filters to Excel `.xlsx` or PDF. Export MUST include all matching rows for the session business, not only the currently visible page.

#### Scenario: Export filtered invoices to Excel

- GIVEN an authenticated session with invoice filters applied
- WHEN the user downloads the Excel export
- THEN the workbook contains only invoices matching those filters for the session business
- AND includes organized headers for invoice number, customer, issue date, due date, total, paid amount, balance, and status

#### Scenario: Export filtered invoices to PDF

- GIVEN an authenticated session with invoice filters applied
- WHEN the user downloads the PDF export
- THEN the PDF contains only invoices matching those filters for the session business
- AND presents the rows in a readable tabular layout
