import { formatCOP } from "@/lib/money";
import { requireSessionOrRedirect } from "@/lib/session";
import { loadStoreFromCookie } from "@/lib/mock/cookie-persistence";
import { getInvoice } from "@/lib/services/invoice-service";
import { getBusinessProfile } from "@/lib/services/business-service";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { InvoiceStatusBadge } from "@/components/domain/invoices/invoice-status-badge";
import { DianNotice } from "@/components/domain/receipts/dian-notice";
import { PrintButton } from "@/components/domain/receipts/print-button";

/**
 * Printable invoice comprobante, per `docs/ui-ux-flow.md`'s "Comprobante
 * imprimible" section and
 * `openspec/changes/mocked-mvp-scaffold/specs/receipts/spec.md`'s
 * "Printable Invoice Comprobante" requirement. NOT a dashboard page: no
 * sidebar/nav, minimal `(print)` layout only.
 *
 * `requireSessionOrRedirect()` runs before any data fetch (defense in depth, same as
 * every other protected page/route) — these are INTERNAL documents per
 * `docs/security-plan.md`, not publicly accessible. `getInvoice` is already
 * scoped to `session.businessId` (`invoice-service.ts`, PR5) and throws
 * `NOT_FOUND` for a cross-business invoice id rather than ever returning
 * another business's data — this page never catches or downgrades that
 * error, so a cross-business request 404s instead of rendering a leaked
 * receipt.
 */

type InvoiceReceiptPageProps = {
  params: Promise<{ id: string }>;
};

export default async function InvoiceReceiptPage({ params }: InvoiceReceiptPageProps) {
  await loadStoreFromCookie();
  const session = await requireSessionOrRedirect();
  const { id } = await params;
  const [business, invoice] = await Promise.all([getBusinessProfile(session), getInvoice(session, id)]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold">{business.name}</h1>
          <p className="text-sm text-muted-foreground">{business.address ?? "-"}</p>
          <p className="text-sm text-muted-foreground">
            {business.phone ?? "-"} {business.email ? `- ${business.email}` : ""}
          </p>
        </div>
        <PrintButton />
      </div>

      <div className="flex flex-wrap items-start justify-between gap-4 border-b pb-4">
        <div className="flex flex-col gap-1">
          <span className="text-sm text-muted-foreground">Factura</span>
          <span className="text-lg font-semibold">{invoice.number}</span>
        </div>
        <InvoiceStatusBadge status={invoice.status} />
      </div>

      <dl className="grid gap-3 sm:grid-cols-2">
        <Field label="Cliente" value={invoice.customer.name} />
        <Field label="Fecha de emision" value={invoice.issueDate} />
        <Field label="Fecha de vencimiento" value={invoice.dueDate ?? "Sin fecha"} />
      </dl>

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

      <dl className="ml-auto grid w-full max-w-xs gap-2 sm:max-w-64">
        <SummaryRow label="Subtotal" value={formatCOP(invoice.subtotal)} />
        <SummaryRow label="Total" value={formatCOP(invoice.total)} />
        <SummaryRow label="Pagado" value={formatCOP(invoice.paidAmount)} />
        <SummaryRow label="Saldo" value={formatCOP(invoice.balance)} />
      </dl>

      <DianNotice />
    </div>
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

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}
