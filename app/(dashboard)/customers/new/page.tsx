import Link from "next/link";
import { requireSessionOrRedirect } from "@/lib/session";
import { loadStoreFromCookie } from "@/lib/mock/cookie-persistence";
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
 * Crear cliente screen (Fase 4 Lane D: dialog -> page conversion, matching
 * `app/(dashboard)/invoices/new/page.tsx`'s pattern). Server Component:
 * resolves the session, then hands off to the lazy-loaded `CustomerForm`
 * client component, which POSTs to `/api/customers` on submit.
 */

export default async function NewCustomerPage() {
  await loadStoreFromCookie();
  await requireSessionOrRedirect();

  return (
    <PageShell>
      <PageHeader
        title="Nuevo cliente"
        breadcrumb={
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink render={<Link href="/customers" />}>Clientes</BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage>Nuevo cliente</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        }
      />
      <CustomerForm />
    </PageShell>
  );
}
