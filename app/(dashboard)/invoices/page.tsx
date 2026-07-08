import Link from "next/link";
import { formatCOP } from "@/lib/money";
import { requireSession } from "@/lib/session";
import { listCustomers } from "@/lib/services/customer-service";
import { listInvoices } from "@/lib/services/invoice-service";
import type { InvoiceStatus } from "@/lib/services/status";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { InvoiceStatusBadge } from "@/components/domain/invoices/invoice-status-badge";

/**
 * Facturas screen, per `docs/ui-ux-flow.md`'s "Facturas" section and
 * `openspec/changes/mocked-mvp-scaffold/specs/invoices/spec.md`. Fetches via
 * `invoice-service` directly (a Server Component call, not a self-fetch of
 * `/api/invoices`), matching `app/(dashboard)/customers/page.tsx`'s (PR4)
 * established pattern.
 */

const PAGE_SIZE = 20;
const CUSTOMER_LOOKUP_PAGE_SIZE = 50;

const VALID_STATUSES: InvoiceStatus[] = ["pending", "partially_paid", "paid", "overdue"];

const STATUS_LABELS: Record<InvoiceStatus, string> = {
  pending: "Pendiente",
  partially_paid: "Parcialmente pagada",
  paid: "Pagada",
  overdue: "Vencida",
};

type InvoicesPageProps = {
  searchParams: Promise<{
    customerId?: string;
    status?: string;
    from?: string;
    to?: string;
    page?: string;
  }>;
};

function parsePageParam(raw: string | undefined): number {
  const value = Number(raw);
  return Number.isInteger(value) && value >= 1 ? value : 1;
}

function parseStatusParam(raw: string | undefined): InvoiceStatus | undefined {
  return raw && (VALID_STATUSES as string[]).includes(raw) ? (raw as InvoiceStatus) : undefined;
}

export default async function InvoicesPage({ searchParams }: InvoicesPageProps) {
  const session = await requireSession();
  const params = await searchParams;
  const status = parseStatusParam(params.status);

  const [result, customersResult] = await Promise.all([
    listInvoices(session, {
      customerId: params.customerId || undefined,
      status,
      from: params.from || undefined,
      to: params.to || undefined,
      page: parsePageParam(params.page),
      pageSize: PAGE_SIZE,
    }),
    listCustomers(session, { page: 1, pageSize: CUSTOMER_LOOKUP_PAGE_SIZE }),
  ]);

  const totalPages = Math.max(1, Math.ceil(result.total / result.pageSize));
  const customerNameById = new Map(customersResult.data.map((customer) => [customer.id, customer.name]));

  return (
    <div className="flex flex-1 flex-col gap-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold">Facturas</h1>
          <p className="text-sm text-muted-foreground">Consulta tus facturas internas y su estado.</p>
        </div>
        <Button render={<Link href="/invoices/new" />}>Crear factura</Button>
      </div>

      <form method="get" className="flex flex-wrap items-end gap-2">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="customerId" className="text-sm text-muted-foreground">
            Cliente
          </label>
          <select
            id="customerId"
            name="customerId"
            defaultValue={params.customerId ?? ""}
            className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none"
          >
            <option value="">Todos</option>
            {customersResult.data.map((customer) => (
              <option key={customer.id} value={customer.id}>
                {customer.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="status" className="text-sm text-muted-foreground">
            Estado
          </label>
          <select
            id="status"
            name="status"
            defaultValue={status ?? ""}
            className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none"
          >
            <option value="">Todos</option>
            {VALID_STATUSES.map((value) => (
              <option key={value} value={value}>
                {STATUS_LABELS[value]}
              </option>
            ))}
          </select>
        </div>
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
            <TableHead>Numero</TableHead>
            <TableHead>Cliente</TableHead>
            <TableHead>Fecha</TableHead>
            <TableHead>Vencimiento</TableHead>
            <TableHead>Total</TableHead>
            <TableHead>Saldo</TableHead>
            <TableHead>Estado</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {result.data.length === 0 ? (
            <TableRow>
              <TableCell colSpan={7} className="text-center text-muted-foreground">
                No se encontraron facturas.
              </TableCell>
            </TableRow>
          ) : (
            result.data.map((invoice) => (
              <TableRow key={invoice.id}>
                <TableCell>
                  <Link href={`/invoices/${invoice.id}`} className="font-medium hover:underline">
                    {invoice.number}
                  </Link>
                </TableCell>
                <TableCell>{customerNameById.get(invoice.customerId) ?? "-"}</TableCell>
                <TableCell>{invoice.issueDate}</TableCell>
                <TableCell>{invoice.dueDate ?? "-"}</TableCell>
                <TableCell>{formatCOP(invoice.total)}</TableCell>
                <TableCell>{formatCOP(invoice.balance)}</TableCell>
                <TableCell>
                  <InvoiceStatusBadge status={invoice.status} />
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>

      <p className="text-sm text-muted-foreground">
        Pagina {result.page} de {totalPages} - {result.total} facturas
      </p>
    </div>
  );
}
