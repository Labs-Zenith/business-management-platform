import { requireSession } from "@/lib/session";
import { loadStoreFromCookie } from "@/lib/mock/cookie-persistence";
import {
  getInvoicedInPeriod,
  getOverdueCount,
  getPaidInPeriod,
  getPendingBalance,
} from "@/lib/services/dashboard-service";
import type { DashboardPeriod } from "@/lib/services/dashboard-period";
import { Card, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { StatCard } from "@/components/domain/stat-card";
import { MoneyAmount } from "@/components/domain/money-amount";

/**
 * The dashboard's 4 headline figures, per `docs/ui-ux-flow.md`'s "Dashboard"
 * content list and `openspec/changes/mocked-mvp-scaffold/specs/dashboard/spec.md`.
 *
 * Two point-in-time ("Pendiente por cobrar", "Facturas vencidas") and two
 * period-scoped ("Facturado", "Cobrado") figures used to live in separate
 * sections — an earlier layout split them because mixing a "right now" number
 * with a "this period" number in one row read as inconsistent. `StatCard`'s
 * `hint` removes the need for that: each card states its own window ("hoy" or
 * the period label) right under the number, so all four can share one grid
 * again without losing the distinction.
 *
 * A standalone async Server Component (not inlined in `page.tsx`) so it can
 * be wrapped in its own `<Suspense>` boundary and stream independently from
 * `RecentPayments`/`TopDebtors`/`OverdueList` — each fetches only what it
 * needs directly from `lib/services/dashboard-service.ts`, never a shared
 * blocking `getDashboardSummary` call.
 */
export async function KpiCards({ period }: { period: DashboardPeriod }) {
  await loadStoreFromCookie();
  const session = await requireSession();
  const [pendingBalance, invoicedInPeriod, paidInPeriod, overdueCount] = await Promise.all([
    getPendingBalance(session),
    getInvoicedInPeriod(session, period),
    getPaidInPeriod(session, period),
    getOverdueCount(session),
  ]);

  const periodHint = period.label.toLowerCase();

  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
      <StatCard
        label="Pendiente por cobrar"
        value={<MoneyAmount cents={pendingBalance} size="lg" />}
        hint="hoy"
      />
      <StatCard
        label="Facturado"
        value={<MoneyAmount cents={invoicedInPeriod} size="lg" />}
        hint={periodHint}
      />
      <StatCard label="Cobrado" value={<MoneyAmount cents={paidInPeriod} size="lg" />} hint={periodHint} />
      <StatCard label="Facturas vencidas" value={overdueCount} hint="hoy" />
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
