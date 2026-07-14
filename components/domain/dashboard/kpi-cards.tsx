import { requireSession } from "@/lib/session";
import { loadStoreFromCookie } from "@/lib/mock/cookie-persistence";
import {
  getInvoicedThisMonth,
  getOverdueCount,
  getPaidThisMonth,
  getPendingBalance,
} from "@/lib/services/dashboard-service";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { MoneyAmount } from "@/components/domain/money-amount";

/**
 * Renders the 4 headline KPI cards ("pendiente por cobrar", "facturado este
 * mes", "pagado del mes", "facturas vencidas" as a count) — per
 * `docs/ui-ux-flow.md`'s "Dashboard" content list and
 * `openspec/changes/mocked-mvp-scaffold/specs/dashboard/spec.md`.
 *
 * A standalone async Server Component (not inlined in `page.tsx`) so it can
 * be wrapped in its own `<Suspense>` boundary and stream independently from
 * `RecentPayments`/`TopDebtors`/`OverdueList` — each fetches only what it
 * needs directly from `lib/services/dashboard-service.ts`, never a shared
 * blocking `getDashboardSummary` call.
 */
export async function KpiCards() {
  await loadStoreFromCookie();
  const session = await requireSession();
  const [pendingBalance, invoicedThisMonth, paidThisMonth, overdueCount] = await Promise.all([
    getPendingBalance(session),
    getInvoicedThisMonth(session),
    getPaidThisMonth(session),
    getOverdueCount(session),
  ]);

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <Card>
        <CardHeader>
          <CardDescription>Pendiente por cobrar</CardDescription>
          <CardTitle>
            <MoneyAmount cents={pendingBalance} size="lg" />
          </CardTitle>
        </CardHeader>
      </Card>
      <Card>
        <CardHeader>
          <CardDescription>Facturado este mes</CardDescription>
          <CardTitle>
            <MoneyAmount cents={invoicedThisMonth} size="lg" />
          </CardTitle>
        </CardHeader>
      </Card>
      <Card>
        <CardHeader>
          <CardDescription>Pagado este mes</CardDescription>
          <CardTitle>
            <MoneyAmount cents={paidThisMonth} size="lg" />
          </CardTitle>
        </CardHeader>
      </Card>
      <Card>
        <CardHeader>
          <CardDescription>Facturas vencidas</CardDescription>
          <CardTitle className="text-2xl">{overdueCount}</CardTitle>
        </CardHeader>
      </Card>
    </div>
  );
}

export function KpiCardsSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {Array.from({ length: 4 }).map((_, index) => (
        <Card key={index}>
          <CardHeader>
            <Skeleton className="h-4 w-32" />
            <Skeleton className="mt-2 h-7 w-24" />
          </CardHeader>
        </Card>
      ))}
    </div>
  );
}
