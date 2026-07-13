# Tasks: Dashboard Export (Excel + PDF)

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~520-560 total (each PR < 400) |
| 400-line budget risk | Medium |
| Chained PRs recommended | Yes |
| Suggested split | PR1 → PR2 → PR3 → PR4 |
| Delivery strategy | ask-on-risk |
| Chain strategy | pending |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: pending
400-line budget risk: Medium

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | `DashboardExportData` type + `renderDashboardWorkbook` (8 sheets) + tests | PR 1 | Base = main/tracker. No route/UI yet. Independently mergeable. Review lens: review-readability |
| 2 | `writeSectionHeading` + `renderDashboardExportPdf` (8 sections) + tests | PR 2 | Base = PR 1 (imports `DashboardExportData` from excel.ts). Review lens: review-readability |
| 3 | `app/api/dashboard/export/route.ts` wiring both renderers + route test | PR 3 | Base = PR 2. Integration slice (auth, format dispatch, empty-state). Review lens: review-reliability + review-risk |
| 4 | Dashboard header Excel/PDF button pair + page test | PR 4 | Base = PR 3. Smallest slice. Review lens: review-readability |

## Phase 1: Excel Renderer (PR 1)

- [x] 1.1 In `lib/export/excel.ts`, add exported `type DashboardExportData = { summary: DashboardSummary; charts: DashboardCharts; expenses: ExpensesSummary }`, importing the 3 source types from their services.
- [x] 1.2 In `lib/export/excel.ts`, add `export async function renderDashboardWorkbook(data)` building 8 sheets in design order: Resumen, Saldo por estado, Mayores saldos, Pagos por mes, Facturas vencidas, Pagos recientes, Gastos por categoria, Gastos recientes. Apply `styleHeader(sheet.getRow(1))` per sheet; money via `formatCOP`; `INVOICE_STATUS_LABELS` for overdue Estado; `datum.label` for categories. No `Cliente` column on Facturas vencidas (intentional).
- [x] 1.3 In `lib/export/excel.test.ts`, add a describe block asserting 8 worksheets exist, each `getRow(1).values` matches its header, and empty-state (empty lists) produces header-only sheets without throwing. Reuse the file's existing render-and-load-with-ExcelJS pattern.

## Phase 2: PDF Renderer (PR 2)

- [ ] 2.1 In `lib/export/pdf.ts`, add private `writeSectionHeading(doc, text)` (lighter than 18pt `writeTitle`, wrapped in `ensureRoom` to guard orphans).
- [ ] 2.2 In `lib/export/pdf.ts`, add `export async function renderDashboardExportPdf(data: DashboardExportData)` importing `DashboardExportData` from `./excel`; one flowing document, `writeTitle` once ("Reporte de Dashboard") then `writeSectionHeading` + `writeTable` per the 8 sections. Reuse `getCategoryLabel` for recent-expenses category. `writeTable` over `[]` for empty lists.
- [ ] 2.3 In `lib/export/pdf.test.ts`, add tests asserting the buffer starts with `%PDF` and that empty-state data renders without throwing. Match the file's existing renderer-call test style.

## Phase 3: Export Route (PR 3)

- [ ] 3.1 Create `app/api/dashboard/export/route.ts`: `export const runtime = "nodejs"`; `GET = withApiHandler` calling `requireSession()`, `parseExportFormat`, then `Promise.all([getDashboardSummary, getDashboardCharts, getExpensesSummary])` into `DashboardExportData`. Dispatch xlsx→`renderDashboardWorkbook`, pdf→`renderDashboardExportPdf`; return `binaryAttachment(buf, mime, "dashboard", ext)`. Mirror `app/api/invoices/export/route.ts`.
- [ ] 3.2 Create `app/api/dashboard/export/dashboard-export-route.test.ts` mirroring `invoices-export-route.test.ts` (hoisted `mockCookieJar`, `next/headers` mock, demo sign-in, `resetStore`): xlsx returns 200 + 8 worksheets + `content-disposition` `dashboard-`; pdf returns `%PDF`; `format=csv`→400 `VALIDATION_ERROR`.

## Phase 4: UI Export Buttons (PR 4)

- [ ] 4.1 In `app/(dashboard)/dashboard/page.tsx`, add Excel/PDF `Button` pair to the header action group via `buildExportHref("/api/dashboard/export", {}, "xlsx"|"pdf")`, matching the invoices-page `nativeButton={false}` + `render={<Link/>}` pattern. Page stays a non-async Server Component (no session in page — confirmed against design).
- [ ] 4.2 Verify (test or type-check) both hrefs resolve to `/api/dashboard/export?format=…`; keep the existing "Crear cliente"/"Crear factura" actions intact.
