import { formatCOP } from "@/lib/money";
import { requireSession } from "@/lib/session";
import { getOverdueCount, getPaidThisMonth, getPendingBalance } from "@/lib/services/dashboard-service";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Renders the 3 headline KPI cards ("pendiente por cobrar", "pagado del
 * mes", "facturas vencidas" as a count) — per
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
  const session = await requireSession();
  const [pendingBalance, paidThisMonth, overdueCount] = await Promise.all([
    getPendingBalance(session),
    getPaidThisMonth(session),
    getOverdueCount(session),
  ]);

  const cards = [
    { label: "Pendiente por cobrar", value: formatCOP(pendingBalance) },
    { label: "Pagado este mes", value: formatCOP(paidThisMonth) },
    { label: "Facturas vencidas", value: String(overdueCount) },
  ];

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {cards.map((card) => (
        <Card key={card.label}>
          <CardHeader>
            <CardDescription>{card.label}</CardDescription>
            <CardTitle className="text-2xl">{card.value}</CardTitle>
          </CardHeader>
        </Card>
      ))}
    </div>
  );
}

export function KpiCardsSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 3 }).map((_, index) => (
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
