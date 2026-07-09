import { requireSession } from "@/lib/session";
import { loadStoreFromCookie } from "@/lib/mock/cookie-persistence";
import { getDashboardCharts } from "@/lib/services/dashboard-service";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { DashboardChartCards } from "./dashboard-chart-cards";

export async function DashboardCharts() {
  await loadStoreFromCookie();
  const session = await requireSession();
  const charts = await getDashboardCharts(session);

  return <DashboardChartCards charts={charts} />;
}

export function DashboardChartsSkeleton() {
  return (
    <div className="grid min-w-0 grid-cols-1 gap-4 xl:grid-cols-3">
      {Array.from({ length: 3 }).map((_, index) => (
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
