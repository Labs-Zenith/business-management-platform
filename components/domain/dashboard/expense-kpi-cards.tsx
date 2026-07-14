import { requireSession } from "@/lib/session";
import { loadStoreFromCookie } from "@/lib/mock/cookie-persistence";
import { getExpensesTotalThisMonth } from "@/lib/services/expense-dashboard-service";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { MoneyAmount } from "@/components/domain/money-amount";

/**
 * Egresos KPI section ("egresos del mes"), mirroring
 * `components/domain/dashboard/kpi-cards.tsx`'s shape. A standalone async
 * Server Component so it streams independently inside the Egresos
 * `TabsPanel` — see `kpi-cards.tsx` for the shared Suspense rationale.
 */
export async function ExpenseKpiCards() {
  await loadStoreFromCookie();
  const session = await requireSession();
  const totalThisMonth = await getExpensesTotalThisMonth(session);

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <Card>
        <CardHeader>
          <CardDescription>Egresos del mes</CardDescription>
          <CardTitle>
            <MoneyAmount cents={totalThisMonth} size="lg" />
          </CardTitle>
        </CardHeader>
      </Card>
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
