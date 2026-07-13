import PDFDocument from "pdfkit";
import { formatCOP } from "@/lib/money";
import { INVOICE_STATUS_LABELS } from "@/lib/export/labels";
import type { Business, InvoiceDetail, PaymentWithRefs } from "@/lib/services/ports";
import type { InvoiceExportRow } from "@/lib/export/excel";

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

function writeTitle(doc: PDFKit.PDFDocument, title: string, subtitle?: string) {
  doc.font("Helvetica-Bold").fontSize(18).fillColor("#171717").text(title);
  if (subtitle) {
    doc.moveDown(0.25).font("Helvetica").fontSize(9).fillColor("#666666").text(subtitle);
  }
  doc.moveDown(1);
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
