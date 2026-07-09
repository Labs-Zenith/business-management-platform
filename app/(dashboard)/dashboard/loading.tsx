import { Skeleton } from "@/components/ui/skeleton";
import { KpiCardsSkeleton } from "@/components/domain/dashboard/kpi-cards";
import { OverdueListSkeleton } from "@/components/domain/dashboard/overdue-list";
import { TopDebtorsSkeleton } from "@/components/domain/dashboard/top-debtors";
import { RecentPaymentsSkeleton } from "@/components/domain/dashboard/recent-payments";
import { DashboardChartsSkeleton } from "@/components/domain/dashboard/dashboard-charts";

/**
 * Top-level Suspense fallback for the initial navigation to `/dashboard`
 * (per-route `loading.tsx`, distinct from each section's own inner
 * `<Suspense>` fallback in `page.tsx`) — reuses each section's own skeleton
 * so the very first paint already matches the eventual per-section layout.
 */
export default function DashboardLoading() {
  return (
    <div className="flex flex-1 flex-col gap-4 p-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-5 w-24" />
          <Skeleton className="h-4 w-72" />
        </div>
        <div className="grid grid-cols-1 gap-2 sm:flex">
          <Skeleton className="h-8 w-full sm:w-28" />
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
