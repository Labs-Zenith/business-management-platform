import { Skeleton } from "@/components/ui/skeleton";
import { KpiCardsSkeleton } from "@/components/domain/dashboard/kpi-cards";
import { DashboardChartsSkeleton } from "@/components/domain/dashboard/dashboard-charts";
import { OverdueListSkeleton } from "@/components/domain/dashboard/overdue-list";
import { TopDebtorsSkeleton } from "@/components/domain/dashboard/top-debtors";
import { RecentPaymentsSkeleton } from "@/components/domain/dashboard/recent-payments";

/**
 * Top-level Suspense fallback for the initial navigation to `/dashboard`
 * (per-route `loading.tsx`, distinct from each section's own inner
 * `<Suspense>` fallback in `page.tsx`) — reuses each section's own skeleton
 * so the very first paint already matches the eventual layout.
 *
 * Mirrors the Ingresos tab's content only (the tab that renders by default):
 * `KpiCardsSkeleton` → `DashboardChartsSkeleton` → the
 * overdue/top-debtors row → `RecentPaymentsSkeleton`. No section-heading
 * skeletons — the single-`<Tabs>` layout this mirrors has none.
 */
export default function DashboardLoading() {
  return (
    <div className="flex w-full flex-1 flex-col gap-4 p-4 sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-5 w-24" />
          <Skeleton className="h-4 w-72" />
        </div>
        {/* Two header actions now: the period selector, then "Exportar". */}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Skeleton className="h-8 w-full sm:w-32" />
          <Skeleton className="h-8 w-full sm:w-28" />
        </div>
      </div>

      <KpiCardsSkeleton />
      <DashboardChartsSkeleton />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <OverdueListSkeleton />
        <TopDebtorsSkeleton />
      </div>

      <RecentPaymentsSkeleton />
    </div>
  );
}
