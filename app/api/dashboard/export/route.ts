import { withApiHandler } from "@/lib/server/http";
import { requireSession } from "@/lib/session";
import { getDashboardSummary, getDashboardCharts } from "@/lib/services/dashboard-service";
import { getExpensesByMonth, getExpensesSummary } from "@/lib/services/expense-dashboard-service";
import { renderDashboardWorkbook, type DashboardChartImages, type DashboardExportData } from "@/lib/export/excel";
import { binaryAttachment, parseExportFormat } from "@/lib/export/http";
import { renderDashboardExportPdf } from "@/lib/export/pdf";
import {
  renderExpensesByCategoryPng,
  renderExpensesByMonthPng,
  renderMonthlyPaymentsPng,
  renderReceivablesByStatusPng,
  renderTopDebtorsPng,
  safeChartPng,
} from "@/lib/export/chart-image";

export const runtime = "nodejs";

export const GET = withApiHandler(async (request: Request) => {
  const session = await requireSession();
  const { searchParams } = new URL(request.url);
  const format = parseExportFormat(searchParams);

  const [summary, charts, expenses, expensesByMonth] = await Promise.all([
    getDashboardSummary(session),
    getDashboardCharts(session),
    getExpensesSummary(session),
    getExpensesByMonth(session),
  ]);
  const data: DashboardExportData = { summary, charts, expenses };

  // Each chart PNG is rendered via `safeChartPng` so a single chart's render
  // failure (e.g. a latent `sharp`/SVG bug) never fails the whole export —
  // the data tables (the export's core value) always come through, degraded
  // only by a placeholder image for the chart that failed. See
  // `lib/export/chart-image.ts`'s `safeChartPng` doc comment.
  const [receivablesByStatus, topDebtors, monthlyPayments, expensesByCategory, expensesByMonthPng] =
    await Promise.all([
      safeChartPng(() => renderReceivablesByStatusPng(charts.receivablesByStatus)),
      safeChartPng(() => renderTopDebtorsPng(charts.topDebtorBalances)),
      safeChartPng(() => renderMonthlyPaymentsPng(charts.monthlyPayments)),
      safeChartPng(() => renderExpensesByCategoryPng(expenses.byCategory)),
      safeChartPng(() => renderExpensesByMonthPng(expensesByMonth)),
    ]);
  const chartImages: DashboardChartImages = {
    receivablesByStatus,
    topDebtors,
    monthlyPayments,
    expensesByCategory,
    expensesByMonth: expensesByMonthPng,
  };

  if (format === "xlsx") {
    const workbook = await renderDashboardWorkbook(data, chartImages);
    return binaryAttachment(
      workbook,
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "dashboard",
      "xlsx",
    );
  }

  const pdf = await renderDashboardExportPdf(data, chartImages);
  return binaryAttachment(pdf, "application/pdf", "dashboard", "pdf");
});
