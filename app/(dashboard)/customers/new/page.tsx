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
    <div className="flex flex-1 flex-col gap-4 p-4">
      <div className="flex flex-col gap-1">
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
        <h1 className="text-lg font-semibold">Crear cliente</h1>
      </div>
      <CustomerForm />
    </div>
  );
}
