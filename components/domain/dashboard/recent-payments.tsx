import Link from "next/link";
import { formatCOP } from "@/lib/money";
import { requireSession } from "@/lib/session";
import { loadStoreFromCookie } from "@/lib/mock/cookie-persistence";
import { getRecentPayments } from "@/lib/services/dashboard-service";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * "Pagos recientes" dashboard section, per `docs/ui-ux-flow.md`'s
 * "Dashboard" content list. Its own independently-streamed Suspense section
 * — see `components/domain/dashboard/kpi-cards.tsx` for the shared rationale.
 */
export async function RecentPayments() {
  await loadStoreFromCookie();
  const session = await requireSession();
  const payments = await getRecentPayments(session);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Pagos recientes</CardTitle>
      </CardHeader>
      <CardContent>
        <Table className="min-w-[560px]">
          <TableHeader>
            <TableRow>
              <TableHead>Fecha</TableHead>
              <TableHead>Cliente</TableHead>
              <TableHead>Factura</TableHead>
              <TableHead>Monto</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {payments.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-muted-foreground">
                  Sin pagos registrados.
                </TableCell>
              </TableRow>
            ) : (
              payments.map((payment) => (
                <TableRow key={payment.id}>
                  <TableCell>{payment.paymentDate}</TableCell>
                  <TableCell>{payment.customer.name}</TableCell>
                  <TableCell>
                    <Link href={`/invoices/${payment.invoice.id}`} className="hover:underline">
                      {payment.invoice.number}
                    </Link>
                  </TableCell>
                  <TableCell>{formatCOP(payment.amount)}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

export function RecentPaymentsSkeleton() {
  return (
    <Card>
      <CardHeader>
        <Skeleton className="h-5 w-40" />
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-8 w-full" />
        ))}
      </CardContent>
    </Card>
  );
}
