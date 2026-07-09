# Payments Delta

## ADDED Requirements

### Requirement: Export Filtered Payments

The system MUST export payments matching the current payment list filters to Excel `.xlsx` or PDF. Export MUST include all matching rows for the session business, not only the currently visible page.

#### Scenario: Export filtered payments to Excel

- GIVEN an authenticated session with payment filters applied
- WHEN the user downloads the Excel export
- THEN the workbook contains only payments matching those filters for the session business
- AND includes organized headers for payment date, customer, invoice, amount, method, and notes

#### Scenario: Export filtered payments to PDF

- GIVEN an authenticated session with payment filters applied
- WHEN the user downloads the PDF export
- THEN the PDF contains only payments matching those filters for the session business
- AND presents the rows in a readable tabular layout
