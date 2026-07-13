import ExcelJS from "exceljs";
import { formatCOP } from "@/lib/money";
import { INVOICE_STATUS_LABELS } from "@/lib/export/labels";
import type { DashboardCharts, DashboardSummary } from "@/lib/services/dashboard-service";
import { getCategoryLabel, type ExpensesSummary } from "@/lib/services/expense-dashboard-service";
import type { InvoiceWithFinance, PaymentWithRefs } from "@/lib/services/ports";

export type InvoiceExportRow = InvoiceWithFinance & {
  customerName: string;
};

/**
 * Shared render input for both the Excel and PDF full-dashboard exports —
 * one composite object assembled once in `app/api/dashboard/export/route.ts`
 * via `Promise.all`, per `openspec/changes/dashboard-excel-export/design.md`.
 */
export type DashboardExportData = {
  summary: DashboardSummary;
  /**
   * `charts.topDebtorBalances` is intentionally unused by this export:
   * the "Mayores saldos" sheet reads `summary.topDebtors` instead (a
   * differently-sourced, same-shaped array), matching
   * `openspec/changes/dashboard-excel-export/design.md`'s "8 sheets" list.
   */
  charts: DashboardCharts;
  expenses: ExpensesSummary;
};

function styleHeader(row: ExcelJS.Row) {
  row.font = { bold: true };
  row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF5F5F5" } };
}

/**
 * Shared row-mapping for an invoice, minus the `Cliente` column — used by
 * both `renderInvoicesWorkbook` (which adds `customer` itself) and the
 * dashboard's "Facturas vencidas" sheet (which has no `Cliente` column at
 * all; see `DashboardExportData`'s doc comment on `design.md`'s rationale).
 */
function mapInvoiceRow(invoice: InvoiceWithFinance) {
  return {
    number: invoice.number,
    issueDate: invoice.issueDate,
    dueDate: invoice.dueDate ?? "-",
    total: formatCOP(invoice.total),
    paid: formatCOP(invoice.paidAmount),
    balance: formatCOP(invoice.balance),
    status: INVOICE_STATUS_LABELS[invoice.status],
  };
}

/**
 * Shared row-mapping for a payment — used by both `renderPaymentsWorkbook`
 * and the dashboard's "Pagos recientes" sheet, which are column-for-column
 * identical.
 */
function mapPaymentRow(payment: PaymentWithRefs) {
  return {
    paymentDate: payment.paymentDate,
    customer: payment.customer.name,
    invoice: payment.invoice.number,
    amount: formatCOP(payment.amount),
    method: payment.method ?? "-",
    notes: payment.notes ?? "-",
  };
}

export async function renderInvoicesWorkbook(rows: InvoiceExportRow[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Facturas");
  sheet.columns = [
    { header: "Numero", key: "number", width: 16 },
    { header: "Cliente", key: "customer", width: 18 },
    { header: "Fecha", key: "issueDate", width: 14 },
    { header: "Vencimiento", key: "dueDate", width: 14 },
    { header: "Total", key: "total", width: 16 },
    { header: "Pagado", key: "paid", width: 16 },
    { header: "Saldo", key: "balance", width: 16 },
    { header: "Estado", key: "status", width: 22 },
  ];
  styleHeader(sheet.getRow(1));
  for (const invoice of rows) {
    sheet.addRow({ ...mapInvoiceRow(invoice), customer: invoice.customerName });
  }
  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

function addResumenSheet(workbook: ExcelJS.Workbook, data: DashboardExportData) {
  const { summary, expenses } = data;
  const resumen = workbook.addWorksheet("Resumen");
  resumen.columns = [
    { header: "Concepto", key: "concept", width: 32 },
    { header: "Valor", key: "value", width: 20 },
  ];
  styleHeader(resumen.getRow(1));
  resumen.addRow({ concept: "Saldo pendiente por cobrar", value: formatCOP(summary.pendingBalance) });
  resumen.addRow({ concept: "Pagado este mes", value: formatCOP(summary.paidThisMonth) });
  resumen.addRow({ concept: "Facturas vencidas", value: summary.overdueInvoices });
  resumen.addRow({ concept: "Gastos del mes", value: formatCOP(expenses.totalThisMonth) });
}

function addSaldoPorEstadoSheet(workbook: ExcelJS.Workbook, charts: DashboardCharts) {
  const saldoPorEstado = workbook.addWorksheet("Saldo por estado");
  saldoPorEstado.columns = [
    { header: "Estado", key: "label", width: 18 },
    { header: "Cantidad", key: "count", width: 12 },
    { header: "Saldo", key: "balance", width: 16 },
    { header: "Total", key: "total", width: 16 },
  ];
  styleHeader(saldoPorEstado.getRow(1));
  for (const datum of charts.receivablesByStatus) {
    saldoPorEstado.addRow({
      label: datum.label,
      count: datum.count,
      balance: formatCOP(datum.balance),
      total: formatCOP(datum.total),
    });
  }
}

function addMayoresSaldosSheet(workbook: ExcelJS.Workbook, summary: DashboardSummary) {
  const mayoresSaldos = workbook.addWorksheet("Mayores saldos");
  mayoresSaldos.columns = [
    { header: "Cliente", key: "name", width: 28 },
    { header: "Saldo", key: "balance", width: 16 },
  ];
  styleHeader(mayoresSaldos.getRow(1));
  for (const debtor of summary.topDebtors) {
    mayoresSaldos.addRow({ name: debtor.name, balance: formatCOP(debtor.balance) });
  }
}

function addPagosPorMesSheet(workbook: ExcelJS.Workbook, charts: DashboardCharts) {
  const pagosPorMes = workbook.addWorksheet("Pagos por mes");
  pagosPorMes.columns = [
    { header: "Mes", key: "label", width: 14 },
    { header: "Monto", key: "amount", width: 16 },
  ];
  styleHeader(pagosPorMes.getRow(1));
  for (const datum of charts.monthlyPayments) {
    pagosPorMes.addRow({ label: datum.label, amount: formatCOP(datum.amount) });
  }
}

function addFacturasVencidasSheet(workbook: ExcelJS.Workbook, summary: DashboardSummary) {
  const facturasVencidas = workbook.addWorksheet("Facturas vencidas");
  facturasVencidas.columns = [
    { header: "Numero", key: "number", width: 16 },
    { header: "Fecha", key: "issueDate", width: 14 },
    { header: "Vencimiento", key: "dueDate", width: 14 },
    { header: "Total", key: "total", width: 16 },
    { header: "Pagado", key: "paid", width: 16 },
    { header: "Saldo", key: "balance", width: 16 },
    { header: "Estado", key: "status", width: 22 },
  ];
  styleHeader(facturasVencidas.getRow(1));
  for (const invoice of summary.overdueInvoiceList) {
    facturasVencidas.addRow(mapInvoiceRow(invoice));
  }
}

function addPagosRecientesSheet(workbook: ExcelJS.Workbook, summary: DashboardSummary) {
  const pagosRecientes = workbook.addWorksheet("Pagos recientes");
  pagosRecientes.columns = [
    { header: "Fecha", key: "paymentDate", width: 14 },
    { header: "Cliente", key: "customer", width: 28 },
    { header: "Factura", key: "invoice", width: 18 },
    { header: "Monto", key: "amount", width: 16 },
    { header: "Metodo", key: "method", width: 18 },
    { header: "Notas", key: "notes", width: 28 },
  ];
  styleHeader(pagosRecientes.getRow(1));
  for (const payment of summary.recentPayments) {
    pagosRecientes.addRow(mapPaymentRow(payment));
  }
}

function addGastosPorCategoriaSheet(workbook: ExcelJS.Workbook, expenses: ExpensesSummary) {
  const gastosPorCategoria = workbook.addWorksheet("Gastos por categoria");
  gastosPorCategoria.columns = [
    { header: "Categoria", key: "label", width: 18 },
    { header: "Total", key: "total", width: 16 },
  ];
  styleHeader(gastosPorCategoria.getRow(1));
  for (const datum of expenses.byCategory) {
    gastosPorCategoria.addRow({ label: datum.label, total: formatCOP(datum.total) });
  }
}

/**
 * The 5 chart PNG buffers embedded into the export's "Graficos" sheet —
 * produced once via `lib/export/chart-image.ts`'s renderers in
 * `app/api/dashboard/export/route.ts`, from the SAME data the on-screen
 * `recharts` chart cards use.
 */
export type DashboardChartImages = {
  receivablesByStatus: Buffer;
  topDebtors: Buffer;
  monthlyPayments: Buffer;
  expensesByCategory: Buffer;
  expensesByMonth: Buffer;
};

/**
 * Vertical spacing (in rows) reserved per chart image on the "Graficos"
 * sheet: each rendered PNG is ~640x320 — at ExcelJS's default ~20px row
 * height that's roughly 16 rows tall, plus 2 rows of breathing room between
 * charts so consecutive images never visually overlap.
 */
const GRAFICOS_ROW_SPAN = 18;
const GRAFICOS_IMAGE_WIDTH = 480;
const GRAFICOS_IMAGE_HEIGHT = 240;

const GRAFICOS_ORDER: { key: keyof DashboardChartImages; title: string }[] = [
  { key: "receivablesByStatus", title: "Saldo por estado" },
  { key: "topDebtors", title: "Mayores saldos" },
  { key: "monthlyPayments", title: "Pagos por mes" },
  { key: "expensesByCategory", title: "Gastos por categoria" },
  { key: "expensesByMonth", title: "Gastos por mes" },
];

/**
 * Single new sheet stacking all 5 dashboard chart images vertically — kept
 * separate from the 8 existing data sheets (additive only) so this change
 * never touches their columns/rows/tests.
 */
function addGraficosSheet(workbook: ExcelJS.Workbook, chartImages: DashboardChartImages) {
  const graficos = workbook.addWorksheet("Graficos");
  let row = 0;
  for (const { key, title } of GRAFICOS_ORDER) {
    graficos.getCell(row + 1, 1).value = title;
    graficos.getCell(row + 1, 1).font = { bold: true };
    // `as any`: same non-deduped `@types/node` mismatch as `excel.test.ts`'s
    // `loadWorkbook` helper — `exceljs`'s own `.d.ts` expects a structurally
    // different (but runtime-identical) `Buffer` type.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const imageId = workbook.addImage({ buffer: chartImages[key] as any, extension: "png" });
    graficos.addImage(imageId, {
      tl: { col: 0, row: row + 1 },
      ext: { width: GRAFICOS_IMAGE_WIDTH, height: GRAFICOS_IMAGE_HEIGHT },
    });
    row += GRAFICOS_ROW_SPAN;
  }
}

function addGastosRecientesSheet(workbook: ExcelJS.Workbook, expenses: ExpensesSummary) {
  const gastosRecientes = workbook.addWorksheet("Gastos recientes");
  gastosRecientes.columns = [
    { header: "Fecha", key: "expenseDate", width: 14 },
    { header: "Categoria", key: "category", width: 16 },
    { header: "Descripcion", key: "description", width: 28 },
    { header: "Monto", key: "amount", width: 16 },
    { header: "Notas", key: "notes", width: 28 },
  ];
  styleHeader(gastosRecientes.getRow(1));
  for (const expense of expenses.recentExpenses) {
    gastosRecientes.addRow({
      expenseDate: expense.expenseDate,
      category: getCategoryLabel(expense.category),
      description: expense.description,
      amount: formatCOP(expense.amount),
      notes: expense.notes ?? "-",
    });
  }
}

/**
 * Full dashboard export (both "Ingresos" and "Egresos" tabs, no filters):
 * one sheet per section, in the exact order documented by
 * `openspec/changes/dashboard-excel-export/design.md`. Reads as a table of
 * contents — each sheet's actual construction lives in its own
 * `add*Sheet` helper above, matching this file's existing
 * one-function-per-sheet precedent (`renderInvoicesWorkbook`,
 * `renderPaymentsWorkbook`). `Facturas vencidas` intentionally has no
 * `Cliente` column — `overdueInvoiceList` only carries `customerId`, and the
 * design deliberately avoids a 4th `collectAllCustomers`-style join just to
 * resolve names for this sheet.
 *
 * A 9th sheet, "Graficos", is appended last (additive only — the original 8
 * data sheets and their order are unchanged): it stacks the 5 dashboard
 * chart PNGs vertically, one per `DashboardChartImages` key, via
 * `addGraficosSheet`.
 */
export async function renderDashboardWorkbook(
  data: DashboardExportData,
  chartImages: DashboardChartImages,
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();

  addResumenSheet(workbook, data);
  addSaldoPorEstadoSheet(workbook, data.charts);
  addMayoresSaldosSheet(workbook, data.summary);
  addPagosPorMesSheet(workbook, data.charts);
  addFacturasVencidasSheet(workbook, data.summary);
  addPagosRecientesSheet(workbook, data.summary);
  addGastosPorCategoriaSheet(workbook, data.expenses);
  addGastosRecientesSheet(workbook, data.expenses);
  addGraficosSheet(workbook, chartImages);

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

export async function renderPaymentsWorkbook(rows: PaymentWithRefs[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Pagos");
  sheet.columns = [
    { header: "Fecha", key: "paymentDate", width: 14 },
    { header: "Cliente", key: "customer", width: 28 },
    { header: "Factura", key: "invoice", width: 18 },
    { header: "Monto", key: "amount", width: 16 },
    { header: "Metodo", key: "method", width: 18 },
    { header: "Notas", key: "notes", width: 28 },
  ];
  styleHeader(sheet.getRow(1));
  for (const payment of rows) {
    sheet.addRow(mapPaymentRow(payment));
  }
  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
