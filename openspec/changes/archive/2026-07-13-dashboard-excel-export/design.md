# Design: Dashboard Export (Excel + PDF)

## Technical Approach

Add `GET /api/dashboard/export?format=xlsx|pdf` that assembles the full dashboard (Ingresos + Egresos) at request time via one `Promise.all([getDashboardSummary, getDashboardCharts, getExpensesSummary])`, then dispatches to a new Excel or PDF renderer. Both renderers take one shared `DashboardExportData` value object. UI adds an Excel/PDF `Button` pair to the dashboard header. No new business logic, schema, filters, or permissions — mirrors the invoices/payments export precedent exactly.

## Architecture Decisions

| Decision | Choice | Rejected alternative | Rationale |
|---|---|---|---|
| Data assembly | 3 composite calls in the route | Fetch each of ~9 leaf functions; or a new combined composite | Composites already cover every section; no new service surface |
| Renderer input | Single `DashboardExportData = { summary, charts, expenses }` object | Positional args per section | Stable signature, self-documenting, easy to test |
| KPI layout (xlsx) | One `Resumen` sheet, 4 label/value rows | Separate Ingresos/Egresos KPI sheets | Proposal fixes 8 sheets; KPIs are scalars, one sheet reads cleaner |
| Overdue sheet columns | No `Cliente` column | Add 4th `collectAllCustomers` call to join names | `overdueInvoiceList` carries only `customerId`; proposal fixes 3 calls, no join |
| Category labels | `datum.label` (byCategory) + `getCategoryLabel(category)` (recentExpenses) | Local label map | Single source of truth; prevents Nómina/Nomina regression |
| PDF section headings | New private `writeSectionHeading` helper in pdf.ts | Reuse 18pt `writeTitle` per section | 18pt too heavy for sections; `ensureRoom` guards orphans |
| Type home | Define `DashboardExportData` in excel.ts, import into pdf.ts | Duplicate or new types file | pdf.ts already imports `InvoiceExportRow` from excel.ts — same precedent |

## Data Flow

    route.ts (requireSession, parseExportFormat)
      └─ Promise.all([getDashboardSummary, getDashboardCharts, getExpensesSummary])
           └─ data: DashboardExportData
                ├─ format=xlsx → renderDashboardWorkbook(data) → Buffer
                └─ format=pdf  → renderDashboardExportPdf(data)  → Buffer
                     └─ binaryAttachment(buf, mime, "dashboard", ext)

## The 8 sheets / sections (exact source shape)

1. **Resumen** — 4 rows: Pendiente por cobrar `summary.pendingBalance`, Pagado del mes `summary.paidThisMonth`, Facturas vencidas `summary.overdueInvoices` (count, plain), Gastos del mes `expenses.totalThisMonth`. Money via `formatCOP`.
2. **Saldo por estado** — `charts.receivablesByStatus`: Estado `label`, Facturas `count`, Saldo `balance`, Total `total`.
3. **Mayores saldos** — `summary.topDebtors`: Cliente `name`, Saldo `balance`.
4. **Pagos por mes** — `charts.monthlyPayments`: Mes `label`, Monto `amount`.
5. **Facturas vencidas** — `summary.overdueInvoiceList`: Numero, Fecha `issueDate`, Vencimiento `dueDate ?? "-"`, Total, Pagado `paidAmount`, Saldo `balance`, Estado (`INVOICE_STATUS_LABELS`). No Cliente column.
6. **Pagos recientes** — `summary.recentPayments`: Fecha, Cliente `customer.name`, Factura `invoice.number`, Monto, Metodo `method ?? "-"`, Notas `notes ?? "-"`.
7. **Gastos por categoria** — `expenses.byCategory`: Categoria `label`, Total.
8. **Gastos recientes** — `expenses.recentExpenses`: Fecha `expenseDate`, Categoria `getCategoryLabel(category)`, Descripcion, Monto `amount`, Notas `notes ?? "-"`.

Excel: each sheet uses `styleHeader(sheet.getRow(1))`. PDF: `writeSectionHeading` + `writeTable` per section in one flowing document; `ensureRoom` (already in `writeTable`) drives page breaks and header repeat.

## Interfaces / Contracts

```ts
// lib/export/excel.ts
export type DashboardExportData = {
  summary: DashboardSummary;      // dashboard-service
  charts: DashboardCharts;        // dashboard-service
  expenses: ExpensesSummary;      // expense-dashboard-service
};
export function renderDashboardWorkbook(data: DashboardExportData): Promise<Buffer>;
// lib/export/pdf.ts
export function renderDashboardExportPdf(data: DashboardExportData): Promise<Buffer>;
```

## File Changes

| File | Action | Description |
|---|---|---|
| `app/api/dashboard/export/route.ts` | Create | `withApiHandler` + `requireSession` + `parseExportFormat`; 3-call `Promise.all`; dispatch; `binaryAttachment(_, _, "dashboard", ext)` |
| `app/api/dashboard/export/dashboard-export-route.test.ts` | Create | Mirrors invoices test: xlsx (8 sheets, header row), pdf (`%PDF`), csv→400 |
| `lib/export/excel.ts` | Modify | Add `DashboardExportData` type + `renderDashboardWorkbook` |
| `lib/export/pdf.ts` | Modify | Add `writeSectionHeading` (private) + `renderDashboardExportPdf` |
| `app/(dashboard)/dashboard/page.tsx` | Modify | Header Excel/PDF `Button` pair via `buildExportHref("/api/dashboard/export", {}, format)` |
| `openspec/specs/dashboard/spec.md` | Modify | Export requirement (owned by sdd-spec) |

UI note: buttons are static `<Link>`s (no session/filter params), so `DashboardPage` stays a non-async Server Component; no `getServerSession` needed in the page.

## Empty / Error Handling

Read-only. Fixed-order sheets (`receivablesByStatus`, `byCategory`) always emit rows (zeros). List sheets render header-only (xlsx) / header-only table (pdf `writeTable` over `[]`) when empty — never throw. `formatCOP(0)` is safe. Auth/format errors flow through `withApiHandler`/`ApiError` (401/400) unchanged.

## Testing Strategy

| Layer | What | Approach |
|---|---|---|
| Integration (route) | xlsx has 8 worksheets + correct header row; pdf magic `%PDF`; csv→400; content-disposition `dashboard-` | Co-located `*.test.ts`, `next/headers` cookie mock + demo sign-in (invoices test pattern) |
| Empty-state | Renderers don't throw on empty lists | Covered by route test if a no-data path is reachable; else assert via renderer unit call |

## Migration / Rollout

No migration required. Additive and read-only. Rollback = revert 5 code files + spec delta.

## Open Questions

- [ ] None blocking. (Overdue-invoices `Cliente` column intentionally omitted to keep 3-call assembly; revisit only if stakeholders require customer names.)
