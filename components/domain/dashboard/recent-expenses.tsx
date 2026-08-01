import Link from "next/link";
import { formatCOP } from "@/lib/money";
import { requireSession } from "@/lib/session";
import { loadStoreFromCookie } from "@/lib/mock/cookie-persistence";
import { getCategoryLabel, getRecentExpenses } from "@/lib/services/expense-dashboard-service";
import { periodRangeLabel, type DashboardPeriod } from "@/lib/services/dashboard-period";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * "Egresos recientes" Egresos section, mirroring
 * `components/domain/dashboard/recent-payments.tsx`'s shape (including the
 * empty-state row). Its own independently-streamed Suspense section — see
 * `kpi-cards.tsx` for the shared rationale.
 */
export async function RecentExpenses({ period }: { period: DashboardPeriod }) {
  await loadStoreFromCookie();
  const session = await requireSession();
  const expenses = await getRecentExpenses(session, period);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Egresos recientes</CardTitle>
      </CardHeader>
      <CardContent>
        <Table className="min-w-[640px]">
          <TableHeader>
            <TableRow>
              <TableHead>Fecha</TableHead>
              <TableHead>Categoría</TableHead>
              <TableHead>Descripción</TableHead>
              <TableHead>Monto</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {expenses.length === 0 ? (
              <TableRow>
                {/* An empty state should offer the way out. The link only
                    navigates — this screen stays read-only, per Fase 5 Lane 4.
                    `periodRangeLabel` (not `period.label` directly) so this
                    reads naturally for every preset — see
                    `recent-payments.tsx`'s identical use. */}
                <TableCell colSpan={4} className="text-center text-muted-foreground">
                  No registraste egresos en {periodRangeLabel(period)}.{" "}
                  <Link href="/egresos" className="text-foreground underline underline-offset-4">
                    Registrar un egreso
                  </Link>
                </TableCell>
              </TableRow>
            ) : (
              expenses.map((expense) => (
                <TableRow key={expense.id}>
                  <TableCell>{expense.expenseDate}</TableCell>
                  <TableCell>{getCategoryLabel(expense.category)}</TableCell>
                  <TableCell>{expense.description}</TableCell>
                  <TableCell>{formatCOP(expense.amount)}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

export function RecentExpensesSkeleton() {
  return (
    <Card>
      <CardHeader>
        <Skeleton className="h-5 w-40" />
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-8 w-full" />
        ))}
      </CardContent>
    </Card>
  );
}
