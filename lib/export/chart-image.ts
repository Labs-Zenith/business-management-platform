/**
 * SVG -> PNG rasterization for the dashboard export chart images, plus one
 * function per dashboard chart that maps the same data the on-screen
 * `recharts` cards use (see `components/domain/dashboard/*-chart-cards.tsx`)
 * into `renderBarChartSvg` (`./chart-svg.ts`) then `svgToPng`.
 *
 * Uses `sharp` (already a Vercel-safe, declared dependency — see
 * `package.json` and `next.config.ts`'s `serverExternalPackages`) instead of
 * `chartjs-node-canvas`/`canvas`, which are forbidden in this environment.
 * A spike confirmed `sharp` 0.34.5 rasterizes an SVG string to a valid PNG
 * here.
 */

import sharp from "sharp";
import { formatCOP } from "@/lib/money";
import { CHART_COLORS, renderBarChartSvg } from "@/lib/export/chart-svg";
import type { DashboardCharts, TopDebtor } from "@/lib/services/dashboard-service";
import type { ExpensesByCategoryDatum, ExpensesByMonthDatum } from "@/lib/services/expense-dashboard-service";

/** Rasterizes an SVG string to a PNG buffer via `sharp`. */
export async function svgToPng(svg: string): Promise<Buffer> {
  return sharp(Buffer.from(svg)).png().toBuffer();
}

/**
 * Hardcoded 1x1 transparent PNG — the last-resort fallback used only if even
 * the (tiny, fixed) placeholder chart SVG fails to rasterize via `sharp`, so
 * `safeChartPng` NEVER throws and always resolves to a valid `Buffer`.
 */
const FALLBACK_TRANSPARENT_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);

let placeholderChartPngPromise: Promise<Buffer> | null = null;

/**
 * Lazily rendered, memoized "Gráfica no disponible" placeholder chart PNG —
 * substituted in by `safeChartPng` for any single chart whose real renderer
 * rejected, so one failing chart never fails the whole dashboard export.
 * Computed once (memoized) since it never varies between requests. Falls
 * back to `FALLBACK_TRANSPARENT_PNG` if the placeholder's own rasterization
 * somehow fails.
 */
function getPlaceholderChartPng(): Promise<Buffer> {
  if (!placeholderChartPngPromise) {
    placeholderChartPngPromise = (async () => {
      try {
        const svg = renderBarChartSvg({ title: "Gráfica no disponible", data: [] });
        return await svgToPng(svg);
      } catch (error) {
        console.error(
          "chart-image: failed to render the placeholder chart PNG; falling back to a hardcoded transparent PNG.",
          error,
        );
        return FALLBACK_TRANSPARENT_PNG;
      }
    })();
  }
  return placeholderChartPngPromise;
}

/**
 * Wraps a single chart PNG render call so a rejection (e.g. `sharp` throwing
 * on a latent SVG bug) never fails the whole dashboard export: logs the
 * error and substitutes the placeholder PNG instead. Used by
 * `app/api/dashboard/export/route.ts` so each of the 5 chart renders
 * degrades independently — the data tables (the export's core value) are
 * never lost just because one chart failed to render.
 */
export async function safeChartPng(render: () => Promise<Buffer>): Promise<Buffer> {
  try {
    return await render();
  } catch (error) {
    console.error("chart-image: chart PNG render failed; substituting the placeholder image.", error);
    return getPlaceholderChartPng();
  }
}

/**
 * Multi-color bar per status — mirrors `receivablesByStatus`'s fixed 4-status
 * order, minus the "paid" status: it always has balance 0 (paid = balance 0)
 * so it adds a flat, uninformative bar, matching the exclusion in the
 * on-screen `dashboard-chart-cards.tsx` chart.
 */
export async function renderReceivablesByStatusPng(data: DashboardCharts["receivablesByStatus"]): Promise<Buffer> {
  const svg = renderBarChartSvg({
    title: "Saldo por estado",
    data: data.filter((datum) => datum.status !== "paid").map((datum) => ({ label: datum.label, value: datum.balance })),
    valueFormatter: formatCOP,
  });
  return svgToPng(svg);
}

/** Horizontal orientation fits long customer names better than vertical bars. */
export async function renderTopDebtorsPng(data: TopDebtor[]): Promise<Buffer> {
  const svg = renderBarChartSvg({
    title: "Mayores saldos",
    data: data.map((debtor) => ({ label: debtor.name, value: debtor.balance })),
    orientation: "horizontal",
    valueFormatter: formatCOP,
  });
  return svgToPng(svg);
}

/** Single color (chart2) across every month bucket — a time series, not a category breakdown. */
export async function renderMonthlyPaymentsPng(data: DashboardCharts["monthlyPayments"]): Promise<Buffer> {
  const svg = renderBarChartSvg({
    title: "Pagos por mes",
    data: data.map((datum) => ({ label: datum.label, value: datum.amount, color: CHART_COLORS.chart2 })),
    valueFormatter: formatCOP,
  });
  return svgToPng(svg);
}

/** Amber palette (chart4/chart5), matching `expense-chart-cards.tsx`'s category card. */
export async function renderExpensesByCategoryPng(data: ExpensesByCategoryDatum[]): Promise<Buffer> {
  const svg = renderBarChartSvg({
    title: "Gastos por categoría",
    data: data.map((datum, index) => ({
      label: datum.label,
      value: datum.total,
      color: [CHART_COLORS.chart5, CHART_COLORS.chart4][index % 2],
    })),
    valueFormatter: formatCOP,
  });
  return svgToPng(svg);
}

/** Single amber color (chart5) across every month bucket, matching `expense-chart-cards.tsx`'s month card. */
export async function renderExpensesByMonthPng(data: ExpensesByMonthDatum[]): Promise<Buffer> {
  const svg = renderBarChartSvg({
    title: "Gastos por mes",
    data: data.map((datum) => ({ label: datum.label, value: datum.amount, color: CHART_COLORS.chart5 })),
    valueFormatter: formatCOP,
  });
  return svgToPng(svg);
}
