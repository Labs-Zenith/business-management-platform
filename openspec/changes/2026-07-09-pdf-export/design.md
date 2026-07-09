# Design: Invoice PDF Download and Financial Exports

## Technical Approach

Use server-side route handlers for binary files. `pdfkit` generates PDFs and `exceljs` generates `.xlsx` workbooks. Route handlers resolve the session, parse the same filters already used by list pages, collect all matching rows through the service layer, and return binary `Response` objects with `Cache-Control: no-store` and `Content-Disposition: attachment`.

## Export Data Flow

- UI builds export links from the current `searchParams`, preserving filters and omitting `page`.
- `GET /api/invoices/export` and `GET /api/payments/export` parse `format=xlsx|pdf`.
- Export helpers fetch all rows by repeatedly calling `listInvoices`/`listPayments` with `pageSize=50`.
- PDF/Excel renderers receive plain row data and localized display strings; they do not fetch data.

## Invoice PDF

`GET /api/invoices/[id]/pdf` fetches business profile + invoice detail using the existing scoped services. The PDF includes the same material information as the current printable receipt: business, customer, number, dates, status, items, totals, paid amount, balance, and the mandatory DIAN notice.

## Dashboard Tooltip

Replace Recharts default tooltip rendering with a small custom tooltip component that uses app tokens (`popover`, `popover-foreground`, `border`) and Spanish labels (`Saldo`, `Monto`, `Total`) instead of raw data keys such as `balance`.

## Architecture Decisions

| Decision | Choice | Rationale |
|---|---|---|
| PDF generation | `pdfkit` | Mature Node PDF generation with explicit layout control and no browser dependency. |
| Excel generation | `exceljs` | Produces real `.xlsx` files and can be parsed in tests. |
| Export scope | Invoices and payments only | Matches user selection and keeps UI focused on financial tables. |
| Delivery | Attachment download | Matches user selection over inline PDF preview. |
