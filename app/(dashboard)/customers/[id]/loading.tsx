import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

/**
 * Suspense fallback for `customers/[id]/page.tsx`. `lib/mock/customer-repo.ts`'s
 * `getById` includes a deliberate simulated-latency `await` (matching the
 * pattern used elsewhere in `lib/mock/**`) so this boundary is genuinely
 * exercised during navigation rather than being dead code.
 */
export default function CustomerDetailLoading() {
  return (
    <div className="flex flex-1 flex-col gap-4 p-4">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-5 w-16" />
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
