# Dashboard Delta

## ADDED Requirements

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
