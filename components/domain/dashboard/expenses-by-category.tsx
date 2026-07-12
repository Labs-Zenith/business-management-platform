import { requireSession } from "@/lib/session";
import { loadStoreFromCookie } from "@/lib/mock/cookie-persistence";
import { getExpensesByCategory } from "@/lib/services/expense-dashboard-service";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { MoneyAmount } from "@/components/domain/money-amount";

/**
 * Egresos "por categoria" breakdown (Nomina / Otro), per
 * `openspec/changes/expenses-dashboard-split/design.md` section 8: a
 * lightweight two-row breakdown, no new chart type. Its own
 * independently-streamed Suspense section — see
 * `components/domain/dashboard/kpi-cards.tsx` for the shared rationale.
 * `getExpensesByCategory` always emits both categories, zeros included, so
 * there is no empty-state branch here (unlike list-shaped sections).
 */
export async function ExpensesByCategory() {
  await loadStoreFromCookie();
  const session = await requireSession();
  const byCategory = await getExpensesByCategory(session);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Gastos por categoría</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {byCategory.map((datum) => (
          <div key={datum.category} className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">{datum.label}</span>
            <MoneyAmount cents={datum.total} />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

export function ExpensesByCategorySkeleton() {
  return (
    <Card>
      <CardHeader>
        <Skeleton className="h-5 w-40" />
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {Array.from({ length: 2 }).map((_, index) => (
          <Skeleton key={index} className="h-6 w-full" />
        ))}
      </CardContent>
    </Card>
  );
}
