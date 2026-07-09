import { withApiHandler } from "@/lib/server/http";
import { requireSession } from "@/lib/session";
import { collectAllPayments } from "@/lib/export/collect";
import { renderPaymentsWorkbook } from "@/lib/export/excel";
import { binaryAttachment, parseExportFormat } from "@/lib/export/http";
import { renderPaymentsExportPdf } from "@/lib/export/pdf";
import type { PaymentListQuery } from "@/lib/services/ports";

export const runtime = "nodejs";

export const GET = withApiHandler(async (request: Request) => {
  const session = await requireSession();
  const { searchParams } = new URL(request.url);
  const format = parseExportFormat(searchParams);
  const filters: Omit<PaymentListQuery, "page" | "pageSize"> = {
    customerId: searchParams.get("customerId") ?? undefined,
    invoiceId: searchParams.get("invoiceId") ?? undefined,
    from: searchParams.get("from") ?? undefined,
    to: searchParams.get("to") ?? undefined,
  };

  const rows = await collectAllPayments(session, filters);

  if (format === "xlsx") {
    const workbook = await renderPaymentsWorkbook(rows);
    return binaryAttachment(
      workbook,
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "pagos",
      "xlsx",
    );
  }

  const pdf = await renderPaymentsExportPdf(rows);
  return binaryAttachment(pdf, "application/pdf", "pagos", "pdf");
});
