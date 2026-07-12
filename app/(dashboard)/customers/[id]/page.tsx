import Link from "next/link";
import type { ReactNode } from "react";
import { requireSessionOrRedirect } from "@/lib/session";
import { loadStoreFromCookie } from "@/lib/mock/cookie-persistence";
import { getCustomer } from "@/lib/services/customer-service";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import CustomerFormDialog from "@/components/domain/customers/customer-form-dialog";
import { InvoiceStatusBadge } from "@/components/domain/invoices/invoice-status-badge";
import { MoneyAmount } from "@/components/domain/money-amount";

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
    <div className="flex flex-1 flex-col gap-4 p-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col gap-1">
          <Link href="/customers" className="text-sm text-muted-foreground hover:underline">
            &larr; Clientes
          </Link>
          <h1 className="text-lg font-semibold">{customer.name}</h1>
          <Badge variant={customer.isActive ? "default" : "outline"} className="w-fit">
            {customer.isActive ? "Activo" : "Inactivo"}
          </Badge>
        </div>
        <CustomerFormDialog
          mode="edit"
          customer={customer}
          trigger={
            <Button variant="outline" className="w-full sm:w-auto">
              Editar
            </Button>
          }
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <SummaryCard label="Total facturado" value={<MoneyAmount cents={customer.totalInvoiced} size="lg" />} />
        <SummaryCard label="Total pagado" value={<MoneyAmount cents={customer.totalPaid} size="lg" />} />
        <SummaryCard label="Saldo pendiente" value={<MoneyAmount cents={customer.balance} size="lg" />} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Datos del cliente</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-3 sm:grid-cols-2">
            <Field label="Documento" value={customer.documentNumber ?? "-"} />
            <Field label="Email" value={customer.email ?? "-"} />
            <Field label="Telefono" value={customer.phone ?? "-"} />
            <Field label="Direccion" value={customer.address ?? "-"} />
            <Field label="Notas" value={customer.notes ?? "-"} />
          </dl>
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
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: ReactNode }) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-1 py-4">
        <span className="text-sm text-muted-foreground">{label}</span>
        <span className="text-lg font-semibold">{value}</span>
      </CardContent>
    </Card>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="text-sm font-medium">{value}</dd>
    </div>
  );
}
