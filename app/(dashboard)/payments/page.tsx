import Link from "next/link";
import { formatCOP } from "@/lib/money";
import { requireSessionOrRedirect } from "@/lib/session";
import { loadStoreFromCookie } from "@/lib/mock/cookie-persistence";
import { listPayments } from "@/lib/services/payment-service";
import { PageShell } from "@/components/ui/page-shell";
import { PageHeader } from "@/components/domain/page-header";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DateFilterField } from "@/components/domain/filters/date-filter-field";
import { ExportMenu } from "@/components/domain/export-menu";

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
  await loadStoreFromCookie();
  const session = await requireSessionOrRedirect();
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
  const exportParams = {
    customerId: params.customerId,
    invoiceId: params.invoiceId,
    from: params.from,
    to: params.to,
    page: params.page,
  };

  return (
    <PageShell>
      <PageHeader
        title="Ingresos"
        description="Consulta los ingresos registrados en tu negocio."
        actions={<ExportMenu path="/api/payments/export" params={exportParams} />}
      />

      <form method="get" className="grid grid-cols-1 items-end gap-2 sm:grid-cols-[10rem_10rem_auto]">
        <DateFilterField name="from" id="from" label="Desde" defaultValue={params.from} />
        <DateFilterField name="to" id="to" label="Hasta" defaultValue={params.to} />
        <Button type="submit" variant="outline" className="w-full sm:w-auto">
          Filtrar
        </Button>
      </form>

      <Table className="min-w-[760px]">
        <TableHeader>
          <TableRow>
            <TableHead>Fecha</TableHead>
            <TableHead>Cliente</TableHead>
            <TableHead>Factura</TableHead>
            <TableHead>Monto</TableHead>
            <TableHead>Metodo</TableHead>
            <TableHead>Comprobante</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {result.data.length === 0 ? (
            <TableRow>
              <TableCell colSpan={6} className="text-center text-muted-foreground">
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
                <TableCell>
                  <Link
                    href={`/payments/${payment.id}/receipt`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-muted-foreground hover:underline"
                  >
                    Ver comprobante
                  </Link>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>

      <p className="text-sm text-muted-foreground">
        Pagina {result.page} de {totalPages} - {result.total} pagos
      </p>
    </PageShell>
  );
}
