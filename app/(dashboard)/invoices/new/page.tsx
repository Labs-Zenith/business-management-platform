import Link from "next/link";
import { requireSession } from "@/lib/session";
import { loadStoreFromCookie } from "@/lib/mock/cookie-persistence";
import { listCustomers } from "@/lib/services/customer-service";
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
  const session = await requireSession();
  const params = await searchParams;

  const result = await listCustomers(session, { page: 1, pageSize: CUSTOMER_LOOKUP_PAGE_SIZE });

  return (
    <div className="flex flex-1 flex-col gap-4 p-4">
      <div className="flex flex-col gap-1">
        <Link href="/invoices" className="text-sm text-muted-foreground hover:underline">
          &larr; Facturas
        </Link>
        <h1 className="text-lg font-semibold">Crear factura</h1>
      </div>
      <InvoiceForm
        customers={result.data.map((customer) => ({ id: customer.id, name: customer.name }))}
        defaultCustomerId={params.customerId}
      />
    </div>
  );
}
