import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

/**
 * Suspense fallback for `invoices/[id]/page.tsx`. `lib/mock/invoice-repo.ts`'s
 * `getById` awaits store reads through the same simulated-latency pattern
 * established elsewhere in `lib/mock/**`, so this boundary is genuinely
 * exercised during navigation rather than being dead code.
 */
export default function InvoiceDetailLoading() {
  return (
    <div className="flex flex-1 flex-col gap-4 p-4">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-5 w-20" />
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <Card key={index}>
            <CardContent className="flex flex-col gap-2 py-4">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-5 w-32" />
            </CardContent>
          </Card>
        ))}
      </div>
      {Array.from({ length: 3 }).map((_, index) => (
        <Card key={index}>
          <CardHeader>
            <Skeleton className="h-5 w-40" />
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {Array.from({ length: 3 }).map((_, rowIndex) => (
              <Skeleton key={rowIndex} className="h-4 w-full" />
            ))}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
