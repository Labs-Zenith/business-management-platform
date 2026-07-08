import Link from "next/link";
import { formatCOP } from "@/lib/money";
import { requireSession } from "@/lib/session";
import { getInvoice } from "@/lib/services/invoice-service";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { InvoiceStatusBadge } from "@/components/domain/invoices/invoice-status-badge";

/**
 * Detalle de factura screen, per `docs/ui-ux-flow.md`'s "Detalle de
 * factura" section and the invoices spec's "Invoice Detail With Recomputed
 * Status" requirement. `getInvoice` always returns the status recomputed at
 * read time (`lib/mock/invoice-repo.ts` via `lib/services/status.ts`), never
 * a stale persisted value.
 *
 * The "Registrar pago" action and payment history table are PR6's scope
 * (payments capability) — this page leaves a clean, clearly-labeled spot for
 * them (a heading + "sin pagos registrados" placeholder) rather than linking
 * to a route that doesn't exist yet, matching the documented deviation
 * already established in PR4's customer detail page.
 */

type InvoiceDetailPageProps = {
  params: Promise<{ id: string }>;
};

export default async function InvoiceDetailPage({ params }: InvoiceDetailPageProps) {
  const session = await requireSession();
  const { id } = await params;
  const invoice = await getInvoice(session, id);

  return (
    <div className="flex flex-1 flex-col gap-4 p-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <Link href="/invoices" className="text-sm text-muted-foreground hover:underline">
            &larr; Facturas
          </Link>
          <h1 className="text-lg font-semibold">{invoice.number}</h1>
          <InvoiceStatusBadge status={invoice.status} />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <SummaryCard label="Total" value={formatCOP(invoice.total)} />
        <SummaryCard label="Pagado" value={formatCOP(invoice.paidAmount)} />
        <SummaryCard label="Saldo pendiente" value={formatCOP(invoice.balance)} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Datos de factura</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-3 sm:grid-cols-2">
            <Field label="Cliente" value={invoice.customer.name} />
            <Field label="Fecha de emision" value={invoice.issueDate} />
            <Field label="Fecha de vencimiento" value={invoice.dueDate ?? "Sin fecha"} />
            <Field label="Nota" value={invoice.notes ?? "-"} />
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Items</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Descripcion</TableHead>
                <TableHead>Cantidad</TableHead>
                <TableHead>Valor unitario</TableHead>
                <TableHead>Total item</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invoice.items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell>{item.description}</TableCell>
                  <TableCell>{item.quantity}</TableCell>
                  <TableCell>{formatCOP(item.unitPrice)}</TableCell>
                  <TableCell>{formatCOP(item.lineTotal)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Pagos</CardTitle>
        </CardHeader>
        <CardContent>
          {invoice.payments.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sin pagos registrados.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Monto</TableHead>
                  <TableHead>Metodo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoice.payments.map((payment) => (
                  <TableRow key={payment.id}>
                    <TableCell>{payment.paymentDate}</TableCell>
                    <TableCell>{formatCOP(payment.amount)}</TableCell>
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

function SummaryCard({ label, value }: { label: string; value: string }) {
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
