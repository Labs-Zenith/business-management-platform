import { requireSession } from "@/lib/session";
import { loadStoreFromCookie } from "@/lib/mock/cookie-persistence";
import { getExpensesTotalInPeriod } from "@/lib/services/expense-dashboard-service";
import type { DashboardPeriod } from "@/lib/services/dashboard-period";
import { Card, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { StatCard } from "@/components/domain/stat-card";
import { MoneyAmount } from "@/components/domain/money-amount";

/**
 * Egresos KPI section ("egresos del mes"), mirroring
 * `components/domain/dashboard/kpi-cards.tsx`'s shape — including the shared
 * `StatCard` (`components/domain/stat-card.tsx`) for the figure. A
 * standalone async Server Component so it streams independently inside the
 * Egresos `TabsPanel` — see `kpi-cards.tsx` for the shared Suspense
 * rationale.
 */
export async function ExpenseKpiCards({ period }: { period: DashboardPeriod }) {
  await loadStoreFromCookie();
  const session = await requireSession();
  const totalInPeriod = await getExpensesTotalInPeriod(session, period);

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <StatCard
        label="Egresos"
        value={<MoneyAmount cents={totalInPeriod} size="lg" />}
        hint={period.label.toLowerCase()}
      />
    </div>
  );
}

export function ExpenseKpiCardsSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <Card>
        <CardHeader>
          <Skeleton className="h-4 w-32" />
          <Skeleton className="mt-2 h-7 w-24" />
        </CardHeader>
      </Card>
    </div>
  );
}
