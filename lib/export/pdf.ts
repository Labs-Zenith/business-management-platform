import PDFDocument from "pdfkit";
import { formatCOP } from "@/lib/money";
import { INVOICE_STATUS_LABELS } from "@/lib/export/labels";
import { getCategoryLabel } from "@/lib/services/expense-dashboard-service";
import type { Business, InvoiceDetail, PaymentWithRefs } from "@/lib/services/ports";
import type { DashboardChartImages, DashboardExportData, InvoiceExportRow } from "@/lib/export/excel";

type PdfTableColumn<T> = {
  header: string;
  width: number;
  align?: "left" | "right" | "center";
  value: (row: T) => string;
};

function createDocument() {
  return new PDFDocument({ size: "A4", margin: 40, bufferPages: true });
}

function collectDocument(doc: PDFKit.PDFDocument): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });
}

function contentWidth(doc: PDFKit.PDFDocument) {
  return doc.page.width - doc.page.margins.left - doc.page.margins.right;
}

function writeTitle(
  doc: PDFKit.PDFDocument,
  title: string,
  subtitle?: string,
  align: "left" | "center" = "left",
) {
  const left = doc.page.margins.left;
  const width = contentWidth(doc);
  doc.font("Helvetica-Bold").fontSize(18).fillColor("#171717").text(title, left, doc.y, { width, align });
  if (subtitle) {
    doc.moveDown(0.25).font("Helvetica").fontSize(9).fillColor("#666666").text(subtitle, left, doc.y, { width, align });
  }
  doc.moveDown(1);
  doc.x = left;
}

/**
 * Reserved height for a section heading: enough room for the heading's own
 * text line plus the `moveDown(0.5)` spacing before the first row of the
 * table that follows it. Used by `ensureRoom` so a heading never gets
 * orphaned alone at the bottom of a page, separated from its table.
 */
const SECTION_HEADING_RESERVED_HEIGHT = 70;

/**
 * Section heading for the multi-section dashboard export — lighter weight
 * than `writeTitle` (which is sized for a document/page title, not a
 * per-section label within one flowing document). Wrapped in `ensureRoom` so
 * a heading never gets orphaned alone at the bottom of a page, separated
 * from the table that follows it. Drawn centered across the content width
 * with an explicit `x`, and resets `doc.x` to the left margin afterward so
 * the table that follows starts flush-left (never inheriting a stale cursor).
 */
function writeSectionHeading(doc: PDFKit.PDFDocument, text: string) {
  ensureRoom(doc, SECTION_HEADING_RESERVED_HEIGHT);
  const left = doc.page.margins.left;
  doc
    .font("Helvetica-Bold")
    .fontSize(12)
    .fillColor("#171717")
    .text(text, left, doc.y, { width: contentWidth(doc), align: "center" });
  doc.moveDown(0.5);
  doc.x = left;
}

function writeKeyValue(doc: PDFKit.PDFDocument, label: string, value: string) {
  doc.font("Helvetica").fontSize(9).fillColor("#666666").text(label, { continued: true });
  doc.font("Helvetica-Bold").fillColor("#171717").text(`  ${value}`);
}

function ensureRoom(doc: PDFKit.PDFDocument, neededHeight: number) {
  if (doc.y + neededHeight > doc.page.height - doc.page.margins.bottom) {
    doc.addPage();
  }
}

/**
 * Fitted width for a dashboard chart PNG (rendered at ~640x320 by
 * `lib/export/chart-image.ts`) — scaled down to fit comfortably within an
 * A4 page's content width after margins. `pdfkit`'s `doc.image` preserves
 * aspect ratio when only `width` is given, so the resulting height is
 * always `CHART_IMAGE_WIDTH * (320 / 640)`.
 */
const CHART_IMAGE_WIDTH = 340;
const CHART_IMAGE_HEIGHT = (CHART_IMAGE_WIDTH * 320) / 640;
const CHART_IMAGE_RESERVED_HEIGHT = CHART_IMAGE_HEIGHT + 16;

/**
 * Writes a single chart PNG horizontally centered on the page, guarded by
 * `ensureRoom` (reserving the image's rendered height plus spacing) so it
 * never gets orphaned split across a page break. An explicit `x`/`y` is
 * passed (so the chart never inherits a stale `doc.x` from the preceding
 * table's last cell and drifts off the right edge); because explicit
 * coordinates put `doc.image` in absolute mode — which does NOT advance the
 * cursor — `doc.y` is advanced manually past the image's rendered height.
 */
function writeChartImage(doc: PDFKit.PDFDocument, png: Buffer) {
  ensureRoom(doc, CHART_IMAGE_RESERVED_HEIGHT);
  const left = doc.page.margins.left;
  const x = left + (contentWidth(doc) - CHART_IMAGE_WIDTH) / 2;
  const y = doc.y;
  doc.image(png, x, y, { width: CHART_IMAGE_WIDTH });
  doc.y = y + CHART_IMAGE_HEIGHT;
  doc.moveDown(1);
  doc.x = left;
}

function writeTable<T>(doc: PDFKit.PDFDocument, rows: T[], columns: PdfTableColumn<T>[]) {
  const startX = doc.page.margins.left;
  const rowHeight = 22;
  const tableWidth = columns.reduce((sum, column) => sum + column.width, 0);

  function writeHeader() {
    ensureRoom(doc, rowHeight * 2);
    let x = startX;
    const y = doc.y;
    doc.rect(startX, y, tableWidth, rowHeight).fill("#f5f5f5");
    doc.font("Helvetica-Bold").fontSize(8).fillColor("#171717");
    for (const column of columns) {
      doc.text(column.header, x + 4, y + 7, { width: column.width - 8, align: column.align ?? "left" });
      x += column.width;
    }
    doc.y = y + rowHeight;
  }

  writeHeader();
  doc.font("Helvetica").fontSize(8).fillColor("#171717");

  for (const row of rows) {
    ensureRoom(doc, rowHeight);
    if (doc.y < doc.page.margins.top + rowHeight) {
      writeHeader();
    }

    const y = doc.y;
    let x = startX;
    doc.strokeColor("#ebebeb").moveTo(startX, y).lineTo(startX + tableWidth, y).stroke();
    for (const column of columns) {
      doc
        .fillColor("#171717")
        .text(column.value(row), x + 4, y + 7, { width: column.width - 8, align: column.align ?? "left" });
      x += column.width;
    }
    doc.y = y + rowHeight;
  }

  doc.strokeColor("#ebebeb").moveTo(startX, doc.y).lineTo(startX + tableWidth, doc.y).stroke();
  doc.x = startX; // restore the cursor to the left margin (each cell left doc.x parked at the last column)
  doc.moveDown(1);
}

export async function renderInvoicePdf(business: Business, invoice: InvoiceDetail): Promise<Buffer> {
  const doc = createDocument();
  const done = collectDocument(doc);

  writeTitle(doc, business.name, `${business.address ?? "-"} · ${business.phone ?? "-"}${business.email ? ` · ${business.email}` : ""}`);
  doc.font("Helvetica-Bold").fontSize(14).fillColor("#171717").text(`Factura ${invoice.number}`);
  doc.moveDown(0.5);
  writeKeyValue(doc, "Cliente", invoice.customer.name);
  writeKeyValue(doc, "Fecha de emision", invoice.issueDate);
  writeKeyValue(doc, "Fecha de vencimiento", invoice.dueDate ?? "Sin fecha");
  writeKeyValue(doc, "Estado", INVOICE_STATUS_LABELS[invoice.status]);
  if (invoice.notes) {
    writeKeyValue(doc, "Nota", invoice.notes);
  }
  doc.moveDown(1);

  writeTable(doc, invoice.items, [
    { header: "Descripcion", width: 220, value: (item) => item.description },
    { header: "Cantidad", width: 70, align: "right", value: (item) => String(item.quantity) },
    { header: "Valor unitario", width: 110, align: "right", value: (item) => formatCOP(item.unitPrice) },
    { header: "Total item", width: 110, align: "right", value: (item) => formatCOP(item.lineTotal) },
  ]);

  doc.font("Helvetica").fontSize(10);
  const summaryX = 350;
  const summary = [
    ["Subtotal", formatCOP(invoice.subtotal)],
    ["Total", formatCOP(invoice.total)],
    ["Pagado", formatCOP(invoice.paidAmount)],
    ["Saldo", formatCOP(invoice.balance)],
  ];
  for (const [label, value] of summary) {
    doc.fillColor("#666666").text(label, summaryX, doc.y, { width: 80, continued: true });
    doc.fillColor("#171717").font("Helvetica-Bold").text(value, { width: 120, align: "right" });
    doc.font("Helvetica");
  }

  doc.end();
  return done;
}

export async function renderInvoicesExportPdf(rows: InvoiceExportRow[]): Promise<Buffer> {
  const doc = createDocument();
  const done = collectDocument(doc);

  writeTitle(doc, "Exportacion de facturas", `${rows.length} registros`);
  writeTable(doc, rows, [
    { header: "Numero", width: 70, value: (invoice) => invoice.number },
    { header: "Cliente", width: 120, value: (invoice) => invoice.customerName },
    { header: "Fecha", width: 65, value: (invoice) => invoice.issueDate },
    { header: "Vence", width: 65, value: (invoice) => invoice.dueDate ?? "-" },
    { header: "Total", width: 80, align: "right", value: (invoice) => formatCOP(invoice.total) },
    { header: "Pagado", width: 80, align: "right", value: (invoice) => formatCOP(invoice.paidAmount) },
    { header: "Saldo", width: 80, align: "right", value: (invoice) => formatCOP(invoice.balance) },
    { header: "Estado", width: 80, value: (invoice) => INVOICE_STATUS_LABELS[invoice.status] },
  ]);
  doc.end();
  return done;
}

export async function renderPaymentsExportPdf(rows: PaymentWithRefs[]): Promise<Buffer> {
  const doc = createDocument();
  const done = collectDocument(doc);

  writeTitle(doc, "Exportacion de pagos", `${rows.length} registros`);
  writeTable(doc, rows, [
    { header: "Fecha", width: 75, value: (payment) => payment.paymentDate },
    { header: "Cliente", width: 145, value: (payment) => payment.customer.name },
    { header: "Factura", width: 90, value: (payment) => payment.invoice.number },
    { header: "Monto", width: 90, align: "right", value: (payment) => formatCOP(payment.amount) },
    { header: "Metodo", width: 90, value: (payment) => payment.method ?? "-" },
    { header: "Notas", width: 110, value: (payment) => payment.notes ?? "-" },
  ]);
  doc.end();
  return done;
}

function writeResumenSection(doc: PDFKit.PDFDocument, data: DashboardExportData) {
  const { summary, expenses } = data;
  writeSectionHeading(doc, "Resumen");
  writeTable(
    doc,
    [
      { concept: "Saldo pendiente por cobrar", value: formatCOP(summary.pendingBalance) },
      { concept: "Pagado este mes", value: formatCOP(summary.paidThisMonth) },
      { concept: "Facturas vencidas", value: String(summary.overdueInvoices) },
      { concept: "Gastos del mes", value: formatCOP(expenses.totalThisMonth) },
    ],
    [
      { header: "Concepto", width: 280, value: (row) => row.concept },
      { header: "Valor", width: 160, align: "right", value: (row) => row.value },
    ],
  );
}

function writeSaldoPorEstadoSection(doc: PDFKit.PDFDocument, charts: DashboardExportData["charts"], chartPng: Buffer) {
  writeSectionHeading(doc, "Saldo por estado");
  writeTable(doc, charts.receivablesByStatus, [
    { header: "Estado", width: 110, value: (row) => row.label },
    { header: "Cantidad", width: 80, align: "right", value: (row) => String(row.count) },
    { header: "Saldo", width: 110, align: "right", value: (row) => formatCOP(row.balance) },
    { header: "Total", width: 110, align: "right", value: (row) => formatCOP(row.total) },
  ]);
  writeChartImage(doc, chartPng);
}

function writeMayoresSaldosSection(doc: PDFKit.PDFDocument, summary: DashboardExportData["summary"], chartPng: Buffer) {
  writeSectionHeading(doc, "Mayores saldos");
  writeTable(doc, summary.topDebtors, [
    { header: "Cliente", width: 280, value: (row) => row.name },
    { header: "Saldo", width: 150, align: "right", value: (row) => formatCOP(row.balance) },
  ]);
  writeChartImage(doc, chartPng);
}

function writePagosPorMesSection(doc: PDFKit.PDFDocument, charts: DashboardExportData["charts"], chartPng: Buffer) {
  writeSectionHeading(doc, "Pagos por mes");
  writeTable(doc, charts.monthlyPayments, [
    { header: "Mes", width: 130, value: (row) => row.label },
    { header: "Monto", width: 150, align: "right", value: (row) => formatCOP(row.amount) },
  ]);
  writeChartImage(doc, chartPng);
}

function writeFacturasVencidasSection(doc: PDFKit.PDFDocument, summary: DashboardExportData["summary"]) {
  writeSectionHeading(doc, "Facturas vencidas");
  writeTable(doc, summary.overdueInvoiceList, [
    { header: "Numero", width: 65, value: (row) => row.number },
    { header: "Fecha", width: 60, value: (row) => row.issueDate },
    { header: "Vencimiento", width: 65, value: (row) => row.dueDate ?? "-" },
    { header: "Total", width: 75, align: "right", value: (row) => formatCOP(row.total) },
    { header: "Pagado", width: 75, align: "right", value: (row) => formatCOP(row.paidAmount) },
    { header: "Saldo", width: 75, align: "right", value: (row) => formatCOP(row.balance) },
    { header: "Estado", width: 75, value: (row) => INVOICE_STATUS_LABELS[row.status] },
  ]);
}

function writePagosRecientesSection(doc: PDFKit.PDFDocument, summary: DashboardExportData["summary"]) {
  writeSectionHeading(doc, "Pagos recientes");
  writeTable(doc, summary.recentPayments, [
    { header: "Fecha", width: 65, value: (row) => row.paymentDate },
    { header: "Cliente", width: 110, value: (row) => row.customer.name },
    { header: "Factura", width: 75, value: (row) => row.invoice.number },
    { header: "Monto", width: 75, align: "right", value: (row) => formatCOP(row.amount) },
    { header: "Metodo", width: 70, value: (row) => row.method ?? "-" },
    { header: "Notas", width: 85, value: (row) => row.notes ?? "-" },
  ]);
}

function writeGastosPorCategoriaSection(
  doc: PDFKit.PDFDocument,
  expenses: DashboardExportData["expenses"],
  chartPng: Buffer,
) {
  writeSectionHeading(doc, "Gastos por categoria");
  writeTable(doc, expenses.byCategory, [
    { header: "Categoria", width: 280, value: (row) => row.label },
    { header: "Total", width: 150, align: "right", value: (row) => formatCOP(row.total) },
  ]);
  writeChartImage(doc, chartPng);
}

/**
 * "Gastos por mes" has no pre-existing data table/sheet (unlike the other 4
 * chart sections) — `getExpensesByMonth` is new, chart-only data added for
 * this PR. Just a heading + the chart image, no `writeTable` call.
 */
function writeGastosPorMesSection(doc: PDFKit.PDFDocument, chartPng: Buffer) {
  writeSectionHeading(doc, "Gastos por mes");
  writeChartImage(doc, chartPng);
}

function writeGastosRecientesSection(doc: PDFKit.PDFDocument, expenses: DashboardExportData["expenses"]) {
  writeSectionHeading(doc, "Gastos recientes");
  writeTable(doc, expenses.recentExpenses, [
    { header: "Fecha", width: 65, value: (row) => row.expenseDate },
    { header: "Categoria", width: 90, value: (row) => getCategoryLabel(row.category) },
    { header: "Descripcion", width: 150, value: (row) => row.description },
    { header: "Monto", width: 80, align: "right", value: (row) => formatCOP(row.amount) },
    { header: "Notas", width: 90, value: (row) => row.notes ?? "-" },
  ]);
}

/**
 * Full dashboard export (both "Ingresos" and "Egresos" tabs, no filters): one
 * continuous flowing document with a `writeSectionHeading` + `writeTable`
 * pair per section (not one page per section) — `ensureRoom` (already inside
 * `writeTable`, and also guarding each heading via `writeSectionHeading`)
 * drives page breaks. Reads as a table of contents — each section's actual
 * construction lives in its own `write*Section` helper above, matching
 * `./excel`'s `renderDashboardWorkbook`/`add*Sheet` precedent. Section
 * list/order matches `renderDashboardWorkbook` in `./excel` exactly, per
 * `openspec/changes/dashboard-excel-export/design.md`, plus a chart image
 * (via `writeChartImage`, itself guarded by `ensureRoom`) appended after each
 * section's table, and a new chart-only "Gastos por mes" section inserted
 * right after "Gastos por categoria" (see `writeGastosPorMesSection`'s doc
 * comment for why it has no table of its own).
 */
export async function renderDashboardExportPdf(
  data: DashboardExportData,
  chartImages: DashboardChartImages,
): Promise<Buffer> {
  const doc = createDocument();
  const done = collectDocument(doc);

  writeTitle(doc, "Reporte de Dashboard", undefined, "center");

  writeResumenSection(doc, data);
  writeSaldoPorEstadoSection(doc, data.charts, chartImages.receivablesByStatus);
  writeMayoresSaldosSection(doc, data.summary, chartImages.topDebtors);
  writePagosPorMesSection(doc, data.charts, chartImages.monthlyPayments);
  writeFacturasVencidasSection(doc, data.summary);
  writePagosRecientesSection(doc, data.summary);
  writeGastosPorCategoriaSection(doc, data.expenses, chartImages.expensesByCategory);
  writeGastosPorMesSection(doc, chartImages.expensesByMonth);
  writeGastosRecientesSection(doc, data.expenses);

  doc.end();
  return done;
}
