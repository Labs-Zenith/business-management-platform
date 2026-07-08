import { Skeleton } from "@/components/ui/skeleton";

/**
 * Suspense fallback for `invoices/page.tsx`. `lib/mock/invoice-repo.ts`'s
 * `list` awaits `withFinance`/store reads through the same simulated-latency
 * pattern established elsewhere in `lib/mock/**`, so this boundary is
 * genuinely exercised during navigation rather than being dead code.
 */
export default function InvoicesLoading() {
  return (
    <div className="flex flex-1 flex-col gap-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-5 w-24" />
          <Skeleton className="h-4 w-72" />
        </div>
        <Skeleton className="h-8 w-32" />
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-8 w-20" />
      </div>
      <div className="flex flex-col gap-2">
        {Array.from({ length: 6 }).map((_, index) => (
          <Skeleton key={index} className="h-10 w-full" />
        ))}
      </div>
    </div>
  );
}
