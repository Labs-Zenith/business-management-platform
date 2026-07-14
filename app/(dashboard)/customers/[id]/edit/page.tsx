import Link from "next/link";
import { requireSessionOrRedirect } from "@/lib/session";
import { loadStoreFromCookie } from "@/lib/mock/cookie-persistence";
import { getCustomer } from "@/lib/services/customer-service";
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
import CustomerForm from "@/components/domain/customers/customer-form";

/**
 * Editar cliente screen (Fase 4 Lane D: dialog -> page conversion, mirroring
 * `app/(dashboard)/invoices/[id]/edit/page.tsx`'s pattern). Server
 * Component: fetches the customer server-side via `customer-service`'s
 * `getCustomer` (same service the detail page already uses — NOT a
 * client-side self-fetch), then hands it to the lazy-loaded `CustomerForm`
 * client component, which pre-fills and PATCHes `/api/customers/{id}` on
 * submit.
 */

type EditCustomerPageProps = {
  params: Promise<{ id: string }>;
};

export default async function EditCustomerPage({ params }: EditCustomerPageProps) {
  await loadStoreFromCookie();
  const session = await requireSessionOrRedirect();
  const { id } = await params;

  const customer = await getCustomer(session, id);

  return (
    <PageShell>
      <PageHeader
        title="Editar cliente"
        breadcrumb={
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink render={<Link href="/customers" />}>Clientes</BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbLink render={<Link href={`/customers/${id}`} />}>{customer.name}</BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage>Editar</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        }
      />
      <CustomerForm
        customer={{
          id: customer.id,
          name: customer.name,
          documentNumber: customer.documentNumber,
          email: customer.email,
          phone: customer.phone,
          address: customer.address,
          notes: customer.notes,
          isActive: customer.isActive,
        }}
      />
    </PageShell>
  );
}
