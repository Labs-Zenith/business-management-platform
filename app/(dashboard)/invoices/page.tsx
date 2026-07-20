import Link from "next/link";
import { Plus } from "lucide-react";
import { formatCOP } from "@/lib/money";
import { requireSessionOrRedirect } from "@/lib/session";
import { loadStoreFromCookie } from "@/lib/mock/cookie-persistence";
import { listCustomers } from "@/lib/services/customer-service";
import { listInvoices } from "@/lib/services/invoice-service";
import type { InvoiceStatus } from "@/lib/services/status";
import { parsePageParam } from "@/lib/pagination";
import { Button } from "@/components/ui/button";
import { PageShell } from "@/components/ui/page-shell";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DateFilterField } from "@/components/domain/filters/date-filter-field";
import { SelectFilterField } from "@/components/domain/filters/select-filter-field";
import { InvoiceStatusBadge } from "@/components/domain/invoices/invoice-status-badge";
import { ExportMenu } from "@/components/domain/export-menu";
import { PageHeader } from "@/components/domain/page-header";
import { TablePagination } from "@/components/domain/table-pagination";

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

function parseStatusParam(raw: string | undefined): InvoiceStatus | undefined {
  return raw && (VALID_STATUSES as string[]).includes(raw) ? (raw as InvoiceStatus) : undefined;
}

export default async function InvoicesPage({ searchParams }: InvoicesPageProps) {
  await loadStoreFromCookie();
  const session = await requireSessionOrRedirect();
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

  const customerNameById = new Map(customersResult.data.map((customer) => [customer.id, customer.name]));
  const exportParams = {
    customerId: params.customerId,
    status: params.status,
    from: params.from,
    to: params.to,
    page: params.page,
  };

  return (
    <PageShell>
      <PageHeader
        title="Facturas"
        description="Consulta tus facturas internas y su estado."
        actions={
          <>
            <ExportMenu path="/api/invoices/export" params={exportParams} />
            <Button className="w-full sm:w-auto" nativeButton={false} render={<Link href="/invoices/new" />}>
              <Plus className="size-4" />
              Crear factura
            </Button>
          </>
        }
      />

      <form method="get" className="grid grid-cols-1 items-end gap-2 sm:grid-cols-2 lg:grid-cols-[minmax(12rem,1fr)_12rem_10rem_10rem_auto]">
        <div className="flex min-w-0 flex-col gap-1.5">
          <label htmlFor="customerId" className="text-sm text-muted-foreground">
            Cliente
          </label>
          <SelectFilterField
            id="customerId"
            name="customerId"
            defaultValue={params.customerId ?? ""}
            options={customersResult.data.map((customer) => ({ value: customer.id, label: customer.name }))}
          />
        </div>
        <div className="flex min-w-0 flex-col gap-1.5">
          <label htmlFor="status" className="text-sm text-muted-foreground">
            Estado
          </label>
          <SelectFilterField
            id="status"
            name="status"
            defaultValue={status ?? ""}
            options={VALID_STATUSES.map((value) => ({ value, label: STATUS_LABELS[value] }))}
          />
        </div>
        <DateFilterField name="from" id="from" label="Desde" defaultValue={params.from} />
        <DateFilterField name="to" id="to" label="Hasta" defaultValue={params.to} />
        <Button type="submit" variant="outline" className="w-full sm:w-auto">
          Filtrar
        </Button>
      </form>

      <Table className="min-w-[900px]">
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

      <TablePagination
        page={result.page}
        pageSize={result.pageSize}
        total={result.total}
        pathname="/invoices"
        params={params}
        itemLabel="facturas"
      />
    </PageShell>
  );
}
