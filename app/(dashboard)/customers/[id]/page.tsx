import Link from "next/link";
import { requireSessionOrRedirect } from "@/lib/session";
import { loadStoreFromCookie } from "@/lib/mock/cookie-persistence";
import { getCustomer } from "@/lib/services/customer-service";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Card, CardContent, CardHeader, CardRow, CardTitle } from "@/components/ui/card";
import { PageShell } from "@/components/ui/page-shell";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { InvoiceStatusBadge } from "@/components/domain/invoices/invoice-status-badge";
import { MoneyAmount } from "@/components/domain/money-amount";
import { PageHeader } from "@/components/domain/page-header";
import { StatCard } from "@/components/domain/stat-card";

/**
 * Detalle de cliente screen, per `docs/ui-ux-flow.md`'s "Detalle de
 * cliente" section and the customers spec's "Customer Detail With Financial
 * Summary" requirement. Renders exactly the fields `customer-repo.ts`
 * (PR1) already computes — no invented fields.
 *
 * Deviation (documented, not blocking): `docs/ui-ux-flow.md` also lists
 * "Crear factura para este cliente" / "Registrar pago desde una factura
 * pendiente" as actions on this screen. Those depend on the invoices/
 * payments capabilities (PR5/PR6, not yet implemented) — omitted here
 * rather than linking to routes that don't exist yet.
 */

type CustomerDetailPageProps = {
  params: Promise<{ id: string }>;
};

export default async function CustomerDetailPage({ params }: CustomerDetailPageProps) {
  await loadStoreFromCookie();
  const session = await requireSessionOrRedirect();
  const { id } = await params;
  const customer = await getCustomer(session, id);

  return (
    <PageShell>
      <PageHeader
        title={customer.name}
        breadcrumb={
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink render={<Link href="/customers" />}>Clientes</BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage>{customer.name}</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        }
        description={
          <Badge variant={customer.isActive ? "success" : "outline"} className="w-fit">
            {customer.isActive ? "Activo" : "Inactivo"}
          </Badge>
        }
        actions={
          <Button
            variant="outline"
            className="w-full sm:w-auto"
            nativeButton={false}
            render={<Link href={`/customers/${customer.id}/edit`} />}
          >
            Editar
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard label="Total facturado" value={<MoneyAmount cents={customer.totalInvoiced} size="lg" />} />
        <StatCard label="Total pagado" value={<MoneyAmount cents={customer.totalPaid} size="lg" />} />
        <StatCard label="Saldo pendiente" value={<MoneyAmount cents={customer.balance} size="lg" />} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Datos del cliente</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          <CardRow label="Documento">{customer.documentNumber ?? "-"}</CardRow>
          <CardRow label="Email">{customer.email ?? "-"}</CardRow>
          <CardRow label="Telefono">{customer.phone ?? "-"}</CardRow>
          <CardRow label="Direccion">{customer.address ?? "-"}</CardRow>
          <CardRow label="Notas">{customer.notes ?? "-"}</CardRow>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Facturas recientes</CardTitle>
        </CardHeader>
        <CardContent>
          {customer.recentInvoices.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sin facturas.</p>
          ) : (
            <Table className="min-w-[680px]">
              <TableHeader>
                <TableRow>
                  <TableHead>Numero</TableHead>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Total</TableHead>
                  <TableHead>Saldo</TableHead>
                  <TableHead>Estado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {customer.recentInvoices.map((invoice) => (
                  <TableRow key={invoice.id}>
                    <TableCell>{invoice.number}</TableCell>
                    <TableCell>{invoice.issueDate}</TableCell>
                    <TableCell className="text-right"><MoneyAmount cents={invoice.total} size="sm" /></TableCell>
                    <TableCell className="text-right"><MoneyAmount cents={invoice.balance} size="sm" /></TableCell>
                    <TableCell>
                      <InvoiceStatusBadge status={invoice.status} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Pagos recientes</CardTitle>
        </CardHeader>
        <CardContent>
          {customer.recentPayments.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sin pagos.</p>
          ) : (
            <Table className="min-w-[560px]">
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Factura</TableHead>
                  <TableHead>Monto</TableHead>
                  <TableHead>Metodo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {customer.recentPayments.map((payment) => (
                  <TableRow key={payment.id}>
                    <TableCell>{payment.paymentDate}</TableCell>
                    <TableCell>{payment.invoice.number}</TableCell>
                    <TableCell className="text-right"><MoneyAmount cents={payment.amount} size="sm" /></TableCell>
                    <TableCell>{payment.method ?? "-"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </PageShell>
  );
}
