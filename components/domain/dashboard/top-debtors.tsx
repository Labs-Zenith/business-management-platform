import Link from "next/link";
import { formatCOP } from "@/lib/money";
import { requireSession } from "@/lib/session";
import { loadStoreFromCookie } from "@/lib/mock/cookie-persistence";
import { getTopDebtors } from "@/lib/services/dashboard-service";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * "Clientes con mayor saldo" dashboard section, per `docs/ui-ux-flow.md`'s
 * "Dashboard" content list. Its own independently-streamed Suspense section
 * — see `components/domain/dashboard/kpi-cards.tsx` for the shared rationale.
 */
export async function TopDebtors() {
  await loadStoreFromCookie();
  const session = await requireSession();
  const debtors = await getTopDebtors(session);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Clientes con mayor saldo</CardTitle>
      </CardHeader>
      <CardContent>
        <Table className="min-w-[360px]">
          <TableHeader>
            <TableRow>
              <TableHead>Cliente</TableHead>
              <TableHead>Saldo</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {debtors.length === 0 ? (
              <TableRow>
                <TableCell colSpan={2} className="text-center text-muted-foreground">
                  Sin clientes con saldo pendiente.
                </TableCell>
              </TableRow>
            ) : (
              debtors.map((debtor) => (
                <TableRow key={debtor.id}>
                  <TableCell>
                    <Link href={`/customers/${debtor.id}`} className="font-medium hover:underline">
                      {debtor.name}
                    </Link>
                  </TableCell>
                  <TableCell>{formatCOP(debtor.balance)}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

export function TopDebtorsSkeleton() {
  return (
    <Card>
      <CardHeader>
        <Skeleton className="h-5 w-56" />
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-8 w-full" />
        ))}
      </CardContent>
    </Card>
  );
}
