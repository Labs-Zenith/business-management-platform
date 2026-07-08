import Link from "next/link";
import { formatCOP } from "@/lib/money";
import { requireSession } from "@/lib/session";
import { listPayments } from "@/lib/services/payment-service";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

/**
 * Pagos screen, per `docs/ui-ux-flow.md`'s "Navegacion principal" ("Pagos"
 * listed as one of the 5 main sections) and
 * `openspec/changes/mocked-mvp-scaffold/specs/payments/spec.md`'s
 * "List Payments Scoped to Business" requirement. A simple read-only list —
 * `docs/ui-ux-flow.md` does not describe a dedicated "### Pagos" screen
 * layout (only the "Registrar pago" dialog action, wired into the invoice
 * detail page instead), so this mirrors `docs/api-spec.md`'s
 * `GET /api/payments` response shape (payment, customer, invoice, method,
 * date) directly, matching `app/(dashboard)/invoices/page.tsx`'s (PR5)
 * established list-page pattern. Fetches via `payment-service` directly (a
 * Server Component call, not a self-fetch of `/api/payments`).
 */

const PAGE_SIZE = 20;

type PaymentsPageProps = {
  searchParams: Promise<{
    customerId?: string;
    invoiceId?: string;
    from?: string;
    to?: string;
    page?: string;
  }>;
};

function parsePageParam(raw: string | undefined): number {
  const value = Number(raw);
  return Number.isInteger(value) && value >= 1 ? value : 1;
}

export default async function PaymentsPage({ searchParams }: PaymentsPageProps) {
  const session = await requireSession();
  const params = await searchParams;

  const result = await listPayments(session, {
    customerId: params.customerId || undefined,
    invoiceId: params.invoiceId || undefined,
    from: params.from || undefined,
    to: params.to || undefined,
    page: parsePageParam(params.page),
    pageSize: PAGE_SIZE,
  });

  const totalPages = Math.max(1, Math.ceil(result.total / result.pageSize));

  return (
    <div className="flex flex-1 flex-col gap-4 p-4">
      <div>
        <h1 className="text-lg font-semibold">Pagos</h1>
        <p className="text-sm text-muted-foreground">Consulta los pagos registrados en tu negocio.</p>
      </div>

      <form method="get" className="flex flex-wrap items-end gap-2">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="from" className="text-sm text-muted-foreground">
            Desde
          </label>
          <Input id="from" name="from" type="date" defaultValue={params.from ?? ""} className="w-40" />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="to" className="text-sm text-muted-foreground">
            Hasta
          </label>
          <Input id="to" name="to" type="date" defaultValue={params.to ?? ""} className="w-40" />
        </div>
        <Button type="submit" variant="outline">
          Filtrar
        </Button>
      </form>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Fecha</TableHead>
            <TableHead>Cliente</TableHead>
            <TableHead>Factura</TableHead>
            <TableHead>Monto</TableHead>
            <TableHead>Metodo</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {result.data.length === 0 ? (
            <TableRow>
              <TableCell colSpan={5} className="text-center text-muted-foreground">
                No se encontraron pagos.
              </TableCell>
            </TableRow>
          ) : (
            result.data.map((payment) => (
              <TableRow key={payment.id}>
                <TableCell>{payment.paymentDate}</TableCell>
                <TableCell>
                  <Link href={`/customers/${payment.customer.id}`} className="font-medium hover:underline">
                    {payment.customer.name}
                  </Link>
                </TableCell>
                <TableCell>
                  <Link href={`/invoices/${payment.invoice.id}`} className="font-medium hover:underline">
                    {payment.invoice.number}
                  </Link>
                </TableCell>
                <TableCell>{formatCOP(payment.amount)}</TableCell>
                <TableCell>{payment.method ?? "-"}</TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>

      <p className="text-sm text-muted-foreground">
        Pagina {result.page} de {totalPages} - {result.total} pagos
      </p>
    </div>
  );
}
