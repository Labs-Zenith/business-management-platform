import Link from "next/link";
import { Suspense } from "react";
import { Button } from "@/components/ui/button";
import { KpiCards, KpiCardsSkeleton } from "@/components/domain/dashboard/kpi-cards";
import { RecentPayments, RecentPaymentsSkeleton } from "@/components/domain/dashboard/recent-payments";
import { TopDebtors, TopDebtorsSkeleton } from "@/components/domain/dashboard/top-debtors";
import { OverdueList, OverdueListSkeleton } from "@/components/domain/dashboard/overdue-list";
import { DashboardCharts, DashboardChartsSkeleton } from "@/components/domain/dashboard/dashboard-charts";
import CustomerFormDialog from "@/components/domain/customers/customer-form-dialog";

/**
 * Dashboard screen, per `docs/ui-ux-flow.md`'s "Dashboard" section
 * ("Total pendiente por cobrar", "Pagos del mes", "Facturas vencidas",
 * "Pagos recientes", "Clientes con mayor saldo", plus "Crear cliente"/
 * "Crear factura" quick actions) and
 * `openspec/changes/mocked-mvp-scaffold/specs/dashboard/spec.md`'s "Dashboard
 * Screen Content and Actions" requirement.
 *
 * Each of the 5 KPIs is rendered by its own independently-streamed section
 * — a standalone async Server Component wrapped in its own `<Suspense>`
 * boundary, per the design's Suspense/Skeleton plan — so a slow section
 * (e.g. `OverdueList`'s extra customer-name lookup) never blocks the others
 * from appearing. Every section calls `lib/services/dashboard-service.ts`
 * directly (never a single combined `getDashboardSummary` fetch, which
 * would defeat independent streaming); `app/api/dashboard/summary/route.ts`
 * is the one that composes them into a single payload, for non-page
 * consumers.
 *
 * "Crear cliente" reuses the same lazy (`ssr:false`) dialog as
 * `app/(dashboard)/customers/page.tsx` (PR4) rather than linking away, for a
 * genuine one-click quick action; "Crear factura" links to the dedicated
 * `/invoices/new` page (a full line-item form, not a dialog).
 */
export default function DashboardPage() {
  return (
    <div className="flex flex-1 flex-col gap-4 p-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-lg font-semibold">Dashboard</h1>
          <p className="text-sm text-muted-foreground">Claridad inmediata sobre tu cartera.</p>
        </div>
        <div className="grid grid-cols-1 gap-2 sm:flex">
          <CustomerFormDialog
            mode="create"
            trigger={
              <Button variant="outline" className="w-full sm:w-auto">
                Crear cliente
              </Button>
            }
          />
          <Button className="w-full sm:w-auto" nativeButton={false} render={<Link href="/invoices/new" />}>
            Crear factura
          </Button>
        </div>
      </div>

      <Suspense fallback={<KpiCardsSkeleton />}>
        <KpiCards />
      </Suspense>

      <Suspense fallback={<DashboardChartsSkeleton />}>
        <DashboardCharts />
      </Suspense>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Suspense fallback={<OverdueListSkeleton />}>
          <OverdueList />
        </Suspense>
        <Suspense fallback={<TopDebtorsSkeleton />}>
          <TopDebtors />
        </Suspense>
      </div>

      <Suspense fallback={<RecentPaymentsSkeleton />}>
        <RecentPayments />
      </Suspense>
    </div>
  );
}
