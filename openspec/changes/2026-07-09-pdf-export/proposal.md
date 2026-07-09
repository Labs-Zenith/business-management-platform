# Proposal: Invoice PDF Download and Financial Exports

## Intent

Add real downloadable PDF output for invoices and export the filtered financial lists (invoices and payments) to Excel/PDF. Also fix the dashboard chart tooltip contrast and labels so chart hover states stay readable in light/dark themes.

## Scope

### In Scope

- Downloadable invoice PDF generated server-side from the same scoped invoice data currently shown in the printable receipt.
- Filter-preserving exports for invoices and payments:
  - Excel `.xlsx`
  - organized PDF
  - all matching rows, not only the current page.
- UI buttons on invoice detail, invoices list, and payments list.
- Dashboard chart tooltip readability and Spanish labels.

### Out of Scope

- Exporting customers, dashboard tables, or detail-page embedded tables.
- Public/unprotected document URLs.
- Email delivery, storage, or background jobs.
- Replacing the existing printable HTML receipt route.

## Multi-tenant / business_id Impact

All PDF/export routes MUST call `requireSession()` and fetch data only through the existing service layer using `session.businessId`. Invoice PDF access to another business's invoice MUST continue to fail with `NOT_FOUND`. Exported rows MUST include only the session business's invoices/payments.

## Rollback Plan

Revert the code and dependency changes. No migrations or external persisted files are introduced. The existing printable HTML receipt remains available as a fallback.

## Success Criteria

- [ ] Invoice detail offers a direct PDF download.
- [ ] Invoices and payments pages export filtered results to `.xlsx` and PDF.
- [ ] Export routes return correct content types and attachment filenames.
- [ ] Dashboard chart tooltips are legible and use Spanish labels.
- [ ] `lint`, `typecheck`, `test`, `build`, and relevant e2e checks pass.
