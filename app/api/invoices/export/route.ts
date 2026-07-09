import { ApiError } from "@/lib/server/api-error";
import { withApiHandler } from "@/lib/server/http";
import { requireSession } from "@/lib/session";
import { collectAllCustomers, collectAllInvoices } from "@/lib/export/collect";
import { renderInvoicesWorkbook, type InvoiceExportRow } from "@/lib/export/excel";
import { binaryAttachment, parseExportFormat } from "@/lib/export/http";
import { renderInvoicesExportPdf } from "@/lib/export/pdf";
import type { InvoiceListQuery } from "@/lib/services/ports";
import type { InvoiceStatus } from "@/lib/services/status";

export const runtime = "nodejs";

const VALID_STATUSES: InvoiceStatus[] = ["pending", "partially_paid", "paid", "overdue"];

function parseStatus(raw: string | null): InvoiceStatus | undefined {
  if (raw === null) {
    return undefined;
  }
  if ((VALID_STATUSES as string[]).includes(raw)) {
    return raw as InvoiceStatus;
  }
  throw new ApiError("VALIDATION_ERROR", 'Invalid "status" query parameter.', { status: raw });
}

export const GET = withApiHandler(async (request: Request) => {
  const session = await requireSession();
  const { searchParams } = new URL(request.url);
  const format = parseExportFormat(searchParams);
  const filters: Omit<InvoiceListQuery, "page" | "pageSize"> = {
    customerId: searchParams.get("customerId") ?? undefined,
    status: parseStatus(searchParams.get("status")),
    from: searchParams.get("from") ?? undefined,
    to: searchParams.get("to") ?? undefined,
  };

  const [invoices, customers] = await Promise.all([collectAllInvoices(session, filters), collectAllCustomers(session)]);
  const customerNameById = new Map(customers.map((customer) => [customer.id, customer.name]));
  const rows: InvoiceExportRow[] = invoices.map((invoice) => ({
    ...invoice,
    customerName: customerNameById.get(invoice.customerId) ?? "-",
  }));

  if (format === "xlsx") {
    const workbook = await renderInvoicesWorkbook(rows);
    return binaryAttachment(
      workbook,
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "facturas",
      "xlsx",
    );
  }

  const pdf = await renderInvoicesExportPdf(rows);
  return binaryAttachment(pdf, "application/pdf", "facturas", "pdf");
});
