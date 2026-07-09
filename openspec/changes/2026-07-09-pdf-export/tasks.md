# Tasks: Invoice PDF Download and Financial Exports

## Phase 1: SDD and Dependencies

- [x] 1.1 Create proposal, design, tasks, and spec deltas.
- [x] 1.2 Add `pdfkit`, `@types/pdfkit`, and `exceljs`.

## Phase 2: Binary Export Foundation

- [x] 2.1 RED: add tests for invoice PDF route headers/body and cross-business denial.
- [x] 2.2 GREEN: implement PDF rendering helper and `GET /api/invoices/[id]/pdf`.
- [x] 2.3 RED: add tests for invoice/payment export routes, filters, content types, and workbook headers.
- [x] 2.4 GREEN: implement shared export helpers and invoice/payment export routes.

## Phase 3: UI

- [x] 3.1 Add invoice PDF download action on invoice detail.
- [x] 3.2 Add Excel/PDF export buttons to invoices and payments list pages, preserving filters.
- [x] 3.3 Fix Recharts tooltip contrast and Spanish labels.

## Phase 4: Verification

- [x] 4.1 Run `npm run lint`.
- [x] 4.2 Run `npm run typecheck`.
- [x] 4.3 Run `npm run test`.
- [x] 4.4 Run `npm run build`.
- [ ] 4.5 Run targeted browser check for export links and dashboard tooltip if dev server is available.
