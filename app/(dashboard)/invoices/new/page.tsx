import Link from "next/link";
import { requireSessionOrRedirect } from "@/lib/session";
import { loadStoreFromCookie } from "@/lib/mock/cookie-persistence";
import { listCustomers } from "@/lib/services/customer-service";
import { listInvoiceTypes } from "@/lib/services/catalog-service";
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
 * Crear factura screen, per `docs/ui-ux-flow.md`'s "Crear factura" section.
 * Server Component: resolves the session and the customer list (for the
 * form's select) directly via `customer-service`, then hands them to the
 * lazy-loaded `InvoiceForm` client component, which POSTs to
 * `/api/invoices` on submit.
 */

const CUSTOMER_LOOKUP_PAGE_SIZE = 50;

type NewInvoicePageProps = {
  searchParams: Promise<{ customerId?: string }>;
};

export default async function NewInvoicePage({ searchParams }: NewInvoicePageProps) {
  await loadStoreFromCookie();
  const session = await requireSessionOrRedirect();
  const params = await searchParams;

  const [result, invoiceTypes] = await Promise.all([
    listCustomers(session, { page: 1, pageSize: CUSTOMER_LOOKUP_PAGE_SIZE }),
    listInvoiceTypes(),
  ]);

  return (
    <PageShell>
      <PageHeader
        title="Crear factura"
        breadcrumb={
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink render={<Link href="/invoices" />}>Facturas</BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage>Nueva factura</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        }
      />
      <InvoiceForm
        customers={result.data.map((customer) => ({ id: customer.id, name: customer.name }))}
        invoiceTypes={invoiceTypes.map((type) => ({ id: type.id, code: type.code, label: type.label }))}
        defaultCustomerId={params.customerId}
      />
    </PageShell>
  );
}
