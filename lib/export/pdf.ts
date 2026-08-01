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

/**
 * `layout` defaults to pdfkit's own default ("portrait") when omitted.
 * `doc.addPage()` (called with no arguments by `ensureRoom`) inherits the
 * document's original options — including `layout` — per pdfkit's
 * `PDFDocument#addPage`, so every subsequent page in a landscape document
 * stays landscape automatically; nothing downstream needs to special-case it.
 */
function createDocument(options?: { layout?: "portrait" | "landscape" }) {
  return new PDFDocument({ size: "A4", margin: 40, bufferPages: true, ...options });
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
 * `lib/export/chart-svg.ts`) — scaled down to fit comfortably within the
 * page's content width after margins, and derived from `contentWidth()`
 * rather than hardcoded so it does not rot when the page layout changes
 * (the dashboard export — the only caller — is landscape A4, giving
 * ~761.89pt of content width; this caps at 560pt so the chart doesn't
 * balloon to the full page width, well under the 640px source PNG's native
 * size so it never pixelates). `pdfkit`'s `doc.image` preserves aspect
 * ratio when only `width` is given, so the resulting height is always
 * `width * (320 / 640)`.
 */
function chartImageWidth(doc: PDFKit.PDFDocument) {
  return Math.min(560, contentWidth(doc) * 0.8);
}

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
  const width = chartImageWidth(doc);
  const height = (width * 320) / 640;
  ensureRoom(doc, height + 16);
  const left = doc.page.margins.left;
  const x = left + (contentWidth(doc) - width) / 2;
  const y = doc.y;
  doc.image(png, x, y, { width });
  doc.y = y + height;
  doc.moveDown(1);
  doc.x = left;
}

/**
 * Floor for a row's rendered height — matches the table's previous fixed
 * row height, kept as a MINIMUM so short single-line rows still look the
 * same as before.
 */
const MIN_ROW_HEIGHT = 22;

/**
 * Vertical room a row needs around its text besides the text's own measured
 * height: 7pt above (matching the `y + 7` offset every cell is drawn at)
 * plus a matching 7pt below, so a wrapped multi-line cell's last line still
 * has breathing room before the next row's top rule.
 */
const ROW_VERTICAL_PADDING = 14;

/**
 * Measures how tall a row needs to be to fit every cell's rendered text
 * (accounting for `lineBreak: true` wrapping — pdfkit's default — in cells
 * whose value is wider than `column.width - 8`), so `writeTable` can size
 * each row to its actual content instead of assuming every cell is a single
 * line. `doc.heightOfString` reads the document's *currently set* font/size,
 * so callers must set those before calling this (both `writeHeader` and the
 * data-row loop below already do, once, before iterating).
 */
function measureRowHeight(doc: PDFKit.PDFDocument, values: string[], columns: { width: number }[]): number {
  let maxTextHeight = 0;
  for (let i = 0; i < columns.length; i += 1) {
    const height = doc.heightOfString(values[i], { width: columns[i].width - 8 });
    if (height > maxTextHeight) {
      maxTextHeight = height;
    }
  }
  return Math.max(MIN_ROW_HEIGHT, maxTextHeight + ROW_VERTICAL_PADDING);
}

function writeTable<T>(doc: PDFKit.PDFDocument, rows: T[], columns: PdfTableColumn<T>[]) {
  const startX = doc.page.margins.left;
  const tableWidth = columns.reduce((sum, column) => sum + column.width, 0);

  function writeHeader() {
    doc.font("Helvetica-Bold").fontSize(8).fillColor("#171717");
    const headerValues = columns.map((column) => column.header);
    const headerHeight = measureRowHeight(doc, headerValues, columns);
    ensureRoom(doc, headerHeight + MIN_ROW_HEIGHT);
    let x = startX;
    const y = doc.y;
    doc.rect(startX, y, tableWidth, headerHeight).fill("#f5f5f5");
    doc.font("Helvetica-Bold").fontSize(8).fillColor("#171717");
    for (let i = 0; i < columns.length; i += 1) {
      doc.text(headerValues[i], x + 4, y + 7, { width: columns[i].width - 8, align: columns[i].align ?? "left" });
      x += columns[i].width;
    }
    doc.y = y + headerHeight;
  }

  writeHeader();
  doc.font("Helvetica").fontSize(8).fillColor("#171717");

  for (const row of rows) {
    const values = columns.map((column) => column.value(row));
    const rowHeight = measureRowHeight(doc, values, columns);
    ensureRoom(doc, rowHeight);
    if (doc.y < doc.page.margins.top + rowHeight) {
      writeHeader();
    }

    const y = doc.y;
    let x = startX;
    doc.strokeColor("#ebebeb").moveTo(startX, y).lineTo(startX + tableWidth, y).stroke();
    for (let i = 0; i < columns.length; i += 1) {
      doc
        .fillColor("#171717")
        .text(values[i], x + 4, y + 7, { width: columns[i].width - 8, align: columns[i].align ?? "left" });
      x += columns[i].width;
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
  writeKeyValue(doc, "Fecha de emisión", invoice.issueDate);
  writeKeyValue(doc, "Fecha de vencimiento", invoice.dueDate ?? "Sin fecha");
  writeKeyValue(doc, "Estado", INVOICE_STATUS_LABELS[invoice.status]);
  if (invoice.notes) {
    writeKeyValue(doc, "Nota", invoice.notes);
  }
  doc.moveDown(1);

  writeTable(doc, invoice.items, [
    { header: "Descripción", width: 220, value: (item) => item.description },
    { header: "Cantidad", width: 70, align: "right", value: (item) => String(item.quantity) },
    { header: "Valor unitario", width: 110, align: "right", value: (item) => formatCOP(item.unitPrice) },
    { header: "Total item", width: 110, align: "right", value: (item) => formatCOP(item.lineTotal) },
  ]);

  doc.font("Helvetica").fontSize(10);
  // Derived (not a hardcoded portrait coordinate) so it stays correct if this
  // document's page geometry ever changes — unlike the three report exports,
  // `renderInvoicePdf` stays portrait, but this keeps the block from rotting.
  const summaryX = doc.page.width - doc.page.margins.right - 200;
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

/**
 * Landscape — this is a wide, column-heavy report table (Número/Cliente/
 * Fecha/Vence/Total/Pagado/Saldo/Estado), not a document handed to a
 * customer, so widening the page beats fighting for portrait's 515.28pt of
 * content width. Column widths sum to 735pt against landscape A4's
 * 761.89pt content width (~27pt slack) — comfortably under, with "Cliente"
 * and "Estado" widened enough that neither clips nor wraps for realistic
 * values (a long business name; "Parcialmente pagada").
 */
export async function renderInvoicesExportPdf(rows: InvoiceExportRow[]): Promise<Buffer> {
  const doc = createDocument({ layout: "landscape" });
  const done = collectDocument(doc);

  writeTitle(doc, "Exportación de facturas", `${rows.length} registros`);
  writeTable(doc, rows, [
    { header: "Número", width: 65, value: (invoice) => invoice.number },
    { header: "Cliente", width: 195, value: (invoice) => invoice.customerName },
    { header: "Fecha", width: 65, value: (invoice) => invoice.issueDate },
    { header: "Vence", width: 65, value: (invoice) => invoice.dueDate ?? "-" },
    { header: "Total", width: 85, align: "right", value: (invoice) => formatCOP(invoice.total) },
    { header: "Pagado", width: 85, align: "right", value: (invoice) => formatCOP(invoice.paidAmount) },
    { header: "Saldo", width: 85, align: "right", value: (invoice) => formatCOP(invoice.balance) },
    { header: "Estado", width: 90, value: (invoice) => INVOICE_STATUS_LABELS[invoice.status] },
  ]);
  doc.end();
  return done;
}

/**
 * Landscape, for the same reason as `renderInvoicesExportPdf` above. Column
 * widths sum to 720pt against landscape A4's 761.89pt content width (~42pt
 * slack), with "Cliente" and "Notas" widened enough to comfortably fit a
 * long customer name and a full sentence of notes without wrapping.
 */
export async function renderPaymentsExportPdf(rows: PaymentWithRefs[]): Promise<Buffer> {
  const doc = createDocument({ layout: "landscape" });
  const done = collectDocument(doc);

  writeTitle(doc, "Exportación de pagos", `${rows.length} registros`);
  writeTable(doc, rows, [
    { header: "Fecha", width: 80, value: (payment) => payment.paymentDate },
    { header: "Cliente", width: 200, value: (payment) => payment.customer.name },
    { header: "Factura", width: 100, value: (payment) => payment.invoice.number },
    { header: "Monto", width: 100, align: "right", value: (payment) => formatCOP(payment.amount) },
    { header: "Método", width: 100, value: (payment) => payment.method ?? "-" },
    { header: "Notas", width: 140, value: (payment) => payment.notes ?? "-" },
  ]);
  doc.end();
  return done;
}

function writeResumenSection(doc: PDFKit.PDFDocument, data: DashboardExportData) {
  const { summary, expenses, periodLabel } = data;
  writeSectionHeading(doc, "Resumen");
  writeTable(
    doc,
    [
      { concept: "Periodo", value: periodLabel },
      // "al momento de exportar" rather than "a hoy": a file gets opened days
      // later. These two are live snapshots and do NOT move with the requested
      // period; the two below them do.
      { concept: "Por cobrar (al momento de exportar)", value: formatCOP(summary.pendingBalance) },
      { concept: "Facturas vencidas (al momento de exportar)", value: String(summary.overdueInvoices) },
      { concept: `Pagado — ${periodLabel}`, value: formatCOP(summary.paidThisMonth) },
      { concept: `Gastos — ${periodLabel}`, value: formatCOP(expenses.totalThisMonth) },
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
  // "Estado" widened from 75 to 100 (avail. 92pt) — at w=75 (avail. 67pt) a
  // value like "Parcialmente pagada" (~75.3pt at 8pt Helvetica) wrapped and
  // overlapped the next row; content-driven row height in `writeTable` now
  // guards against overlap even if a value still wraps, but the extra width
  // makes wrapping rare instead of routine for this column's real values.
  writeTable(doc, summary.overdueInvoiceList, [
    { header: "Número", width: 70, value: (row) => row.number },
    { header: "Fecha", width: 65, value: (row) => row.issueDate },
    { header: "Vencimiento", width: 75, value: (row) => row.dueDate ?? "-" },
    { header: "Total", width: 85, align: "right", value: (row) => formatCOP(row.total) },
    { header: "Pagado", width: 85, align: "right", value: (row) => formatCOP(row.paidAmount) },
    { header: "Saldo", width: 85, align: "right", value: (row) => formatCOP(row.balance) },
    { header: "Estado", width: 100, value: (row) => INVOICE_STATUS_LABELS[row.status] },
  ]);
}

function writePagosRecientesSection(doc: PDFKit.PDFDocument, summary: DashboardExportData["summary"]) {
  writeSectionHeading(doc, "Pagos recientes");
  // "Cliente" widened from 110 to 160 and "Notas" from 85 to 130 — at their
  // old widths a long business name (~118.7pt) and a full-sentence note
  // (~84.5pt) both wrapped past `writeTable`'s old fixed 22pt row height and
  // overlapped the next row's text.
  writeTable(doc, summary.recentPayments, [
    { header: "Fecha", width: 70, value: (row) => row.paymentDate },
    { header: "Cliente", width: 160, value: (row) => row.customer.name },
    { header: "Factura", width: 80, value: (row) => row.invoice.number },
    { header: "Monto", width: 80, align: "right", value: (row) => formatCOP(row.amount) },
    { header: "Método", width: 80, value: (row) => row.method ?? "-" },
    { header: "Notas", width: 130, value: (row) => row.notes ?? "-" },
  ]);
}

function writeGastosPorCategoriaSection(
  doc: PDFKit.PDFDocument,
  expenses: DashboardExportData["expenses"],
  chartPng: Buffer,
) {
  writeSectionHeading(doc, "Gastos por categoría");
  writeTable(doc, expenses.byCategory, [
    { header: "Categoría", width: 280, value: (row) => row.label },
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
  // "Descripción" widened from 150 to 220 and "Notas" from 90 to 140 for the
  // same reason as "Pagos recientes" above — longer free-text values in
  // these two columns were the most likely to wrap under the old widths.
  writeTable(doc, expenses.recentExpenses, [
    { header: "Fecha", width: 70, value: (row) => row.expenseDate },
    { header: "Categoría", width: 110, value: (row) => getCategoryLabel(row.category) },
    { header: "Descripción", width: 220, value: (row) => row.description },
    { header: "Monto", width: 90, align: "right", value: (row) => formatCOP(row.amount) },
    { header: "Notas", width: 140, value: (row) => row.notes ?? "-" },
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
 *
 * Landscape: several of these tables (widest is "Gastos recientes" at
 * 630pt) benefit from more than portrait A4's 515.28pt of content width so
 * their widened columns (see each section's own comment) don't clip.
 * Landscape drops usable page height from ~761.89pt to ~515.28pt, so page
 * breaks inside a section's table happen more often — `contentWidth()` and
 * `ensureRoom()` both read the page's live geometry, so nothing else here
 * needs to change for that.
 */
export async function renderDashboardExportPdf(
  data: DashboardExportData,
  chartImages: DashboardChartImages,
): Promise<Buffer> {
  const doc = createDocument({ layout: "landscape" });
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
