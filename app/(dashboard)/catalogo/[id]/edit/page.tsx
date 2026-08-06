import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSessionOrRedirect } from "@/lib/session";
import { loadStoreFromCookie } from "@/lib/mock/cookie-persistence";
import { isCatalogEnabled } from "@/lib/services/features";
import { getCatalogProduct, listCatalogCategories } from "@/lib/services/product-catalog-service";
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
 * Editar producto de catálogo screen. Mirrors
 * `invoices/[id]/edit/page.tsx`'s structure: a Server Component resolving the
 * session + feature gate + existing categories, handing them plus the
 * fetched `product` (via `getCatalogProduct`) to the SAME lazy-loaded
 * `CatalogProductForm`, which then pre-fills and PATCHes
 * `/api/catalog-products/{id}` instead of POSTing. Unlike invoice editing,
 * there is no payment-based edit lock here — `CatalogProductRepository.update`
 * always replaces variants/tiers wholesale (see `lib/services/ports.ts`'s
 * doc comment), so this page never redirects away.
 */

type EditCatalogProductPageProps = {
  params: Promise<{ id: string }>;
};

export default async function EditCatalogProductPage({ params }: EditCatalogProductPageProps) {
  await loadStoreFromCookie();
  const session = await requireSessionOrRedirect();

  if (!(await isCatalogEnabled(session.businessId))) {
    notFound();
  }

  const { id } = await params;

  const [product, categories] = await Promise.all([
    getCatalogProduct(session, id),
    listCatalogCategories(session),
  ]);

  return (
    <PageShell>
      <PageHeader
        title="Editar producto de catálogo"
        breadcrumb={
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink render={<Link href="/catalogo" />}>Catálogo</BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbLink render={<Link href={`/catalogo/${id}`} />}>{product.name}</BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage>Editar</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        }
      />
      <CatalogProductForm
        categories={categories}
        product={{
          id: product.id,
          name: product.name,
          category: product.category,
          description: product.description,
          pricingMode: product.pricingMode,
          minOrderQuantity: product.minOrderQuantity,
          fixedUnitPrice: product.fixedUnitPrice,
          areaBasePrice: product.areaBasePrice,
          areaRatePerM2: product.areaRatePerM2,
          areaMinPrice: product.areaMinPrice,
          active: product.active,
          variants: product.variants.map((variant) => ({
            name: variant.name,
            description: variant.description,
            unitPrice: variant.unitPrice,
            packageQuantity: variant.packageQuantity,
            packageTotalPrice: variant.packageTotalPrice,
            tiers: variant.tiers.map((tier) => ({
              quantity: tier.quantity,
              unitPrice: tier.unitPrice,
              flatTotalPrice: tier.flatTotalPrice,
            })),
          })),
        }}
      />
    </PageShell>
  );
}
