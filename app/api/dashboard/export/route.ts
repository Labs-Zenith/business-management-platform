import { withApiHandler } from "@/lib/server/http";
import { requireSession } from "@/lib/session";
import { getDashboardSummary, getDashboardCharts } from "@/lib/services/dashboard-service";
import { getExpensesSummary } from "@/lib/services/expense-dashboard-service";
import { renderDashboardWorkbook, type DashboardExportData } from "@/lib/export/excel";
import { binaryAttachment, parseExportFormat } from "@/lib/export/http";
import { renderDashboardExportPdf } from "@/lib/export/pdf";

export const runtime = "nodejs";

export const GET = withApiHandler(async (request: Request) => {
  const session = await requireSession();
  const { searchParams } = new URL(request.url);
  const format = parseExportFormat(searchParams);

  const [summary, charts, expenses] = await Promise.all([
    getDashboardSummary(session),
    getDashboardCharts(session),
    getExpensesSummary(session),
  ]);
  const data: DashboardExportData = { summary, charts, expenses };

  if (format === "xlsx") {
    const workbook = await renderDashboardWorkbook(data);
    return binaryAttachment(
      workbook,
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "dashboard",
      "xlsx",
    );
  }

  const pdf = await renderDashboardExportPdf(data);
  return binaryAttachment(pdf, "application/pdf", "dashboard", "pdf");
});
