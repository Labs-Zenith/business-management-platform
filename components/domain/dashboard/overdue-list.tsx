import Link from "next/link";
import { formatCOP } from "@/lib/money";
import { requireSession } from "@/lib/session";
import { loadStoreFromCookie } from "@/lib/mock/cookie-persistence";
import { getOverdueInvoices } from "@/lib/services/dashboard-service";
import { listCustomers } from "@/lib/services/customer-service";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";

// Matches `app/(dashboard)/invoices/page.tsx`'s established
// `CUSTOMER_LOOKUP_PAGE_SIZE` convention for resolving customer names in a
// list view without a per-row fetch.
const CUSTOMER_LOOKUP_PAGE_SIZE = 50;

/**
 * "Facturas vencidas" dashboard section, per `docs/ui-ux-flow.md`'s
 * "Dashboard" content list. Its own independently-streamed Suspense section
 * — see `components/domain/dashboard/kpi-cards.tsx` for the shared rationale.
 * Invoice `status` comes from `getOverdueInvoices`
 * (`lib/services/dashboard-service.ts`), which is always the
 * repository-recomputed value, never a stale persisted field.
 */
export async function OverdueList() {
  await loadStoreFromCookie();
  const session = await requireSession();
  const [invoices, customersResult] = await Promise.all([
    getOverdueInvoices(session),
    listCustomers(session, { page: 1, pageSize: CUSTOMER_LOOKUP_PAGE_SIZE }),
  ]);
  const customerNameById = new Map(customersResult.data.map((customer) => [customer.id, customer.name]));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Facturas vencidas</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Numero</TableHead>
              <TableHead>Cliente</TableHead>
              <TableHead>Vencimiento</TableHead>
              <TableHead>Saldo</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {invoices.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-muted-foreground">
                  No hay facturas vencidas.
                </TableCell>
              </TableRow>
            ) : (
              invoices.map((invoice) => (
                <TableRow key={invoice.id}>
                  <TableCell>
                    <Link href={`/invoices/${invoice.id}`} className="font-medium hover:underline">
                      {invoice.number}
                    </Link>
                  </TableCell>
                  <TableCell>{customerNameById.get(invoice.customerId) ?? "-"}</TableCell>
                  <TableCell>{invoice.dueDate ?? "-"}</TableCell>
                  <TableCell>{formatCOP(invoice.balance)}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

export function OverdueListSkeleton() {
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
