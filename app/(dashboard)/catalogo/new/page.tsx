import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSessionOrRedirect } from "@/lib/session";
import { loadStoreFromCookie } from "@/lib/mock/cookie-persistence";
import { isCatalogEnabled } from "@/lib/services/features";
import { listCatalogCategories } from "@/lib/services/product-catalog-service";
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
import CatalogProductForm from "@/components/domain/catalogo/catalog-product-form";

/**
 * Crear producto de catálogo screen. Server Component: resolves the
 * session, re-checks the `catalog` feature gate (the authoritative check —
 * see `catalogo/page.tsx`'s doc comment), and the business's existing
 * category values (for the form's "Categoría" `<datalist>`), then hands them
 * to the lazy-loaded `CatalogProductForm`, which POSTs to
 * `/api/catalog-products` on submit. Mirrors
 * `invoices/new/page.tsx`'s structure.
 */
export default async function NewCatalogProductPage() {
  await loadStoreFromCookie();
  const session = await requireSessionOrRedirect();

  if (!(await isCatalogEnabled(session.businessId))) {
    notFound();
  }

  const categories = await listCatalogCategories(session);

  return (
    <PageShell>
      <PageHeader
        title="Nuevo producto de catálogo"
        breadcrumb={
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink render={<Link href="/catalogo" />}>Catálogo</BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage>Nuevo producto</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        }
      />
      <CatalogProductForm categories={categories} />
    </PageShell>
  );
}
