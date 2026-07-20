import { requireSession } from "@/lib/session";
import { loadStoreFromCookie } from "@/lib/mock/cookie-persistence";
import {
  getInvoicedThisMonth,
  getOverdueCount,
  getPaidThisMonth,
  getPendingBalance,
} from "@/lib/services/dashboard-service";
import { Card, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { StatCard } from "@/components/domain/stat-card";
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
 *
 * Renders each figure via the shared `StatCard`
 * (`components/domain/stat-card.tsx`), replacing this file's previously
 * hand-rolled `Card`/`CardHeader`/`CardDescription`/`CardTitle` markup —
 * `expense-kpi-cards.tsx` mirrors the same shape.
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
    <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
      <StatCard label="Pendiente por cobrar" value={<MoneyAmount cents={pendingBalance} size="lg" />} />
      <StatCard label="Facturado este mes" value={<MoneyAmount cents={invoicedThisMonth} size="lg" />} />
      <StatCard label="Pagado este mes" value={<MoneyAmount cents={paidThisMonth} size="lg" />} />
      <StatCard label="Facturas vencidas" value={overdueCount} />
    </div>
  );
}

export function KpiCardsSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
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
