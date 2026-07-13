# Proposal: Dashboard Export (Excel + PDF)

## Intent

The dashboard (Ingresos + Egresos) is the owner's at-a-glance financial picture, but there is no way to take it off-screen — for accountants, board reviews, or offline records. Invoices and payments already export via a `format`-param route; the dashboard is the one high-value surface still trapped in the UI. This closes that gap (Fase 2, point 3).

## Scope

### In Scope
- New `GET /api/dashboard/export?format=xlsx|pdf` assembling ALL dashboard data (Ingresos + Egresos) and dispatching by `format`.
- Excel: one workbook, one sheet per section (8 sections below).
- PDF: one flowing "Reporte de Dashboard" report, section headings + tables.
- "Exportar" Excel/PDF button pair in the dashboard page header.

### Out of Scope
- Rendered chart images (tables carry the same numbers per existing convention).
- Filters/date ranges (dashboard has none), scheduling, email delivery.
- New business logic, schema changes, or role/permission gating.

## Capabilities

### New Capabilities
- None

### Modified Capabilities
- `dashboard`: add a requirement that authenticated users can export the full dashboard (both tabs) as Excel or PDF, business-scoped, computed at request time.

## Approach

- **Route** (`app/api/dashboard/export/route.ts`): `withApiHandler` + `requireSession()` + `parseExportFormat`, mirroring `invoices/payments/export`. Assemble via `Promise.all([getDashboardSummary, getDashboardCharts, getExpensesSummary])` (composites already cover all ~9 functions; no filters). Dispatch to Excel or PDF renderer; return `binaryAttachment(..., "dashboard", ext)`.
- **Excel** (`renderDashboardWorkbook` in `lib/export/excel.ts`): 8 sheets — Resumen (KPIs), Saldo por estado, Mayores saldos, Pagos por mes, Facturas vencidas, Pagos recientes, Gastos por categoria, Gastos recientes — each header row via existing `styleHeader`.
- **PDF** (new `renderDashboardExportPdf` in `lib/export/pdf.ts`): reuse existing `createDocument`/`writeTitle`/`writeTable`/`ensureRoom`; single flowing document with a section heading + table per section, `ensureRoom` handling page breaks (not chart images, not one-page-per-section).
- **UI**: Excel/PDF `Button` pair via `buildExportHref("/api/dashboard/export", {}, format)`, mirroring invoices/payments (no filter params).
- **Labels**: reuse `getCategoryLabel`/`CATEGORY_META` (`getExpensesByCategory` already returns `label`); never duplicate the map (prevents the "Nómina"/"Nomina" bug).

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `app/api/dashboard/export/route.ts` | New | format-dispatch export route |
| `lib/export/excel.ts` | Modified | add `renderDashboardWorkbook` |
| `lib/export/pdf.ts` | Modified | add `renderDashboardExportPdf` |
| `app/(dashboard)/dashboard/page.tsx` | Modified | Exportar button pair |
| `openspec/specs/dashboard/spec.md` | Modified | new export requirement |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Category label duplication regresses | Low | Reuse `getCategoryLabel`/emitted `label` |
| PDF section overflow / page breaks | Med | Reuse `ensureRoom` + `writeTable` header repeat |
| Empty dashboard renders broken export | Med | Sections render zero/empty rows, never error |

## Rollback Plan

Read-only, additive. Revert the four code changes and the spec delta; no data or schema migration to undo.

## Dependencies

- `exceljs` and `pdfkit` (already installed and used).

## Success Criteria

- [ ] `?format=xlsx` returns an 8-sheet workbook of both tabs' data, business-scoped.
- [ ] `?format=pdf` returns a multi-section "Reporte de Dashboard".
- [ ] Header Exportar buttons download the current business's data.
- [ ] Category labels match the dashboard exactly (accents intact).
- [ ] Empty-state business exports without error.
