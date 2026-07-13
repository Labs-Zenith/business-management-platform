import { requireSession } from "@/lib/session";
import { loadStoreFromCookie } from "@/lib/mock/cookie-persistence";
import { getExpensesByCategory, getExpensesByMonth } from "@/lib/services/expense-dashboard-service";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ExpenseChartCards } from "./expense-chart-cards";

export async function ExpenseCharts() {
  await loadStoreFromCookie();
  const session = await requireSession();
  const [byCategory, byMonth] = await Promise.all([getExpensesByCategory(session), getExpensesByMonth(session)]);

  return <ExpenseChartCards charts={{ byCategory, byMonth }} />;
}

export function ExpenseChartsSkeleton() {
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
