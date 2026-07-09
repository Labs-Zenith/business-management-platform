import ExcelJS from "exceljs";
import { formatCOP } from "@/lib/money";
import { INVOICE_STATUS_LABELS } from "@/lib/export/labels";
import type { InvoiceWithFinance, PaymentWithRefs } from "@/lib/services/ports";

export type InvoiceExportRow = InvoiceWithFinance & {
  customerName: string;
};

function styleHeader(row: ExcelJS.Row) {
  row.font = { bold: true };
  row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF5F5F5" } };
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
    sheet.addRow({
      number: invoice.number,
      customer: invoice.customerName,
      issueDate: invoice.issueDate,
      dueDate: invoice.dueDate ?? "-",
      total: formatCOP(invoice.total),
      paid: formatCOP(invoice.paidAmount),
      balance: formatCOP(invoice.balance),
      status: INVOICE_STATUS_LABELS[invoice.status],
    });
  }
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
    sheet.addRow({
      paymentDate: payment.paymentDate,
      customer: payment.customer.name,
      invoice: payment.invoice.number,
      amount: formatCOP(payment.amount),
      method: payment.method ?? "-",
      notes: payment.notes ?? "-",
    });
  }
  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
