import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

/**
 * Suspense fallback for `settings/page.tsx`. The mock's `getBusinessProfile`
 * always resolves in practice, but `lib/mock/business-repo.ts` includes a
 * deliberate simulated-latency `await` (matching the pattern used elsewhere
 * in `lib/mock/**`) so this boundary is genuinely exercised during
 * navigation rather than being dead code.
 */
export default function SettingsLoading() {
  return (
    <div className="flex flex-1 flex-col p-4">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <Skeleton className="h-6 w-32" />
          <Skeleton className="h-4 w-64" />
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-4">
            {Array.from({ length: 5 }).map((_, index) => (
              <div key={index} className="flex flex-col gap-1">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-4 w-40" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
