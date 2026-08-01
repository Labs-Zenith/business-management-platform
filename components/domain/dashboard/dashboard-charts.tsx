import { requireSession } from "@/lib/session";
import { loadStoreFromCookie } from "@/lib/mock/cookie-persistence";
import { getPeriodCharts, getPortfolioCharts } from "@/lib/services/dashboard-service";
import type { DashboardPeriod } from "@/lib/services/dashboard-period";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { PortfolioChartCards } from "./portfolio-chart-cards";
import { IngresosTrendChart } from "./ingresos-trend-chart";

/**
 * The Ingresos tab's two charts, side by side: `PortfolioChartCards` is a
 * live snapshot of the portfolio ("Por cobrar por estado", no date range),
 * `IngresosTrendChart` follows the selected period ("Facturado vs cobrado
 * por mes"). Fetched together with `Promise.all` and rendered as one unit —
 * they used to be two separately-exported pairs
 * (`PortfolioCharts`/`IngresosTrendCharts`) living in two different screen
 * sections, back when the point-in-time and period-scoped halves of the
 * dashboard were visually split; now that split is gone (see `page.tsx`), so
 * there is no longer a reason for the two fetches to be two separate
 * `<Suspense>` boundaries — a business with either dataset missing still gets
 * a fast combined render, and this file goes back to owning one card pair
 * like `expense-charts.tsx` does for its own two charts.
 *
 * DO NOT reintroduce a "Mayores deudores" chart here: it used to duplicate
 * `top-debtors.tsx`'s table with the exact same `getTopDebtors` rows — see
 * `portfolio-chart-cards.tsx`'s doc comment.
 */
export async function DashboardCharts({ period }: { period: DashboardPeriod }) {
  await loadStoreFromCookie();
  const session = await requireSession();
  const [portfolio, periodCharts] = await Promise.all([
    getPortfolioCharts(session),
    getPeriodCharts(session, period),
  ]);

  return (
    <div className="grid min-w-0 grid-cols-1 gap-4 xl:grid-cols-2">
      <PortfolioChartCards charts={portfolio} />
      <IngresosTrendChart charts={periodCharts} />
    </div>
  );
}

export function DashboardChartsSkeleton() {
  return (
    <div className="grid min-w-0 grid-cols-1 gap-4 xl:grid-cols-2">
      {Array.from({ length: 2 }).map((_, index) => (
        <Card key={index} className="min-w-0">
          <CardHeader>
            <Skeleton className="h-5 w-36" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-52 w-full" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
