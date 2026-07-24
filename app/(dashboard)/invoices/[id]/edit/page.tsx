import Link from "next/link";
import { redirect } from "next/navigation";
import { requireSessionOrRedirect } from "@/lib/session";
import { loadStoreFromCookie } from "@/lib/mock/cookie-persistence";
import { listCustomers } from "@/lib/services/customer-service";
import { listProducts } from "@/lib/services/product-service";
import { getInvoice } from "@/lib/services/invoice-service";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { PageShell } from "@/components/ui/page-shell";
import { PageHeader } from "@/components/domain/page-header";
import InvoiceForm from "@/components/domain/invoices/invoice-form";

/**
 * Editar factura screen, per
 * `openspec/changes/invoice-edit-partial/specs/invoices/spec.md`'s "Invoice
 * Editing Locked to Fully-Paid Invoices" (this change relaxes the original
 * `audit-log` change's zero-payment gate to "editable while not fully paid")
 * and this change's PR3 scope ("least structural rework of the existing
 * create flow" — see this change's apply-progress notes). Mirrors
 * `app/(dashboard)/invoices/new/page.tsx` almost exactly: a Server Component
 * resolving the session + customer list + active product list, handing them
 * to the SAME lazy-loaded `InvoiceForm` client component, which now also
 * receives the fetched `invoice` (via `getInvoice`) so it pre-fills and
 * PATCHes `/api/invoices/{id}` instead of POSTing. Each item's `productId`
 * (already present on `InvoiceDetail#items` — see `lib/services/ports.ts`)
 * flows straight through so the form's product `<Select>` starts on the
 * right selection per `invoice-form-content.tsx`'s `toItemDefaultValues`.
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
// Mirrors `app/(dashboard)/invoices/new/page.tsx`'s product-lookup page size.
const PRODUCT_LOOKUP_PAGE_SIZE = 200;

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

  const [result, productsResult] = await Promise.all([
    listCustomers(session, { page: 1, pageSize: CUSTOMER_LOOKUP_PAGE_SIZE }),
    listProducts(session, { page: 1, pageSize: PRODUCT_LOOKUP_PAGE_SIZE }),
  ]);
  // Only active products are offered for a NEW pick — an existing line whose
  // `productId` references an inactive product still prefills correctly via
  // `invoice-form-content.tsx`'s "Otro" fallback (see that file's
  // `toItemDefaultValues`), it just can't be re-selected as a fresh choice.
  const activeProducts = productsResult.data.filter((product) => product.active);

  return (
    <PageShell>
      <PageHeader
        title="Editar factura"
        breadcrumb={
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
        }
      />
      <InvoiceForm
        customers={result.data.map((customer) => ({ id: customer.id, name: customer.name }))}
        // The "Tipo de factura" dropdown is never rendered in edit mode (the
        // type is immutable after creation — see `invoice-form-content.tsx`'s
        // doc comment), so no catalog fetch is needed here; `[]` satisfies
        // the required prop without an unused query.
        invoiceTypes={[]}
        products={activeProducts.map((product) => ({
          id: product.id,
          name: product.name,
          currentQuantity: product.currentQuantity,
        }))}
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
            productId: item.productId,
          })),
        }}
      />
    </PageShell>
  );
}
