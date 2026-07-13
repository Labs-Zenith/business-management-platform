import Link from "next/link";
import { redirect } from "next/navigation";
import { requireSessionOrRedirect } from "@/lib/session";
import { loadStoreFromCookie } from "@/lib/mock/cookie-persistence";
import { listCustomers } from "@/lib/services/customer-service";
import { getInvoice } from "@/lib/services/invoice-service";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import InvoiceForm from "@/components/domain/invoices/invoice-form";

/**
 * Editar factura screen, per
 * `openspec/changes/invoice-edit-partial/specs/invoices/spec.md`'s "Invoice
 * Editing Locked to Fully-Paid Invoices" (this change relaxes the original
 * `audit-log` change's zero-payment gate to "editable while not fully paid")
 * and this change's PR3 scope ("least structural rework of the existing
 * create flow" — see this change's apply-progress notes). Mirrors
 * `app/(dashboard)/invoices/new/page.tsx` almost exactly: a Server Component
 * resolving the session + customer list, handing them to the SAME
 * lazy-loaded `InvoiceForm` client component, which now also receives the
 * fetched `invoice` (via `getInvoice`) so it pre-fills and PATCHes
 * `/api/invoices/{id}` instead of POSTing.
 *
 * Not-fully-paid UI gate (defense-in-depth nicety, NOT the enforcement — the
 * server's edit-lock in `updateInvoice`/`InvoiceRepository.update` is the
 * actual enforcement, per this change's relaxed rule: editable while
 * `balance > 0`, locked once `balance <= 0`): only once the invoice is FULLY
 * paid (`balance <= 0`) does this page redirect back to the invoice detail
 * page rather than rendering a form whose submit would always be rejected
 * with `CONFLICT`. A partially-paid invoice (`paidAmount > 0` but
 * `balance > 0`) still renders the form normally. The detail page itself only
 * renders the "Editar factura" link while `balance > 0`, so reaching this
 * page with a fully-paid invoice can only happen via a stale link, back
 * button, or a direct URL — redirect is not a security control here, it's
 * just a coherent recovery.
 */

const CUSTOMER_LOOKUP_PAGE_SIZE = 50;

type EditInvoicePageProps = {
  params: Promise<{ id: string }>;
};

export default async function EditInvoicePage({ params }: EditInvoicePageProps) {
  await loadStoreFromCookie();
  const session = await requireSessionOrRedirect();
  const { id } = await params;

  const invoice = await getInvoice(session, id);
  if (invoice.balance <= 0) {
    redirect(`/invoices/${id}`);
  }

  const result = await listCustomers(session, { page: 1, pageSize: CUSTOMER_LOOKUP_PAGE_SIZE });

  return (
    <div className="flex flex-1 flex-col gap-4 p-4">
      <div className="flex flex-col gap-1">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink render={<Link href="/invoices" />}>Facturas</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbLink render={<Link href={`/invoices/${id}`} />}>{invoice.number}</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>Editar</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
        <h1 className="text-lg font-semibold">Editar factura</h1>
      </div>
      <InvoiceForm
        customers={result.data.map((customer) => ({ id: customer.id, name: customer.name }))}
        invoice={{
          id: invoice.id,
          customerId: invoice.customerId,
          issueDate: invoice.issueDate,
          dueDate: invoice.dueDate,
          notes: invoice.notes,
          paidAmount: invoice.paidAmount,
          items: invoice.items.map((item) => ({
            description: item.description,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
          })),
        }}
      />
    </div>
  );
}
