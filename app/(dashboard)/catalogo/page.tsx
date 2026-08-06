import Link from "next/link";
import { notFound } from "next/navigation";
import { Pencil, Plus } from "lucide-react";
import { formatCOP } from "@/lib/money";
import { requireSessionOrRedirect } from "@/lib/session";
import { loadStoreFromCookie } from "@/lib/mock/cookie-persistence";
import { isCatalogEnabled } from "@/lib/services/features";
import { listCatalogCategories, listCatalogProducts } from "@/lib/services/product-catalog-service";
import { CATALOG_PRODUCT_SORT_KEYS, type CatalogProductSummary, type PricingMode } from "@/lib/services/ports";
import { parsePageParam } from "@/lib/pagination";
import { parseSortParams, type Sort } from "@/lib/sort";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageShell } from "@/components/ui/page-shell";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { HiddenParams } from "@/components/domain/filters/hidden-params";
import { SelectFilterField } from "@/components/domain/filters/select-filter-field";
import { MoneyAmount } from "@/components/domain/money-amount";
import { canDeleteRecords } from "@/lib/services/permissions";
import { PageHeader } from "@/components/domain/page-header";
import { TablePagination } from "@/components/domain/table-pagination";
import { TableSortHeader } from "@/components/domain/table-sort-header";
import { PRICING_MODE_LABELS, PricingModeBadge } from "@/components/domain/catalogo/pricing-mode-badge";
import CatalogProductFormDialog from "@/components/domain/catalogo/catalog-product-form-dialog";
import DeleteCatalogProductButton from "@/components/domain/catalogo/delete-catalog-product-button";

/**
 * Catálogo (commercial price book) list screen — distinct from `/inventario`,
 * per `migrations/1700000016000_add_catalog_products.sql`'s header comment.
 * Gated by the per-BUSINESS `catalog` feature flag (`isCatalogEnabled`,
 * `lib/services/features.ts`), mirroring `ventas/page.tsx`'s
 * `isPipelineEnabled` guard exactly: `notFound()` (not a redirect) hides the
 * feature's existence for a business that doesn't have it enabled. This is
 * the REAL authority — hiding the "Catálogo" nav item is a UX complement
 * only.
 *
 * Filters are a plain `<form method="get">` (never client state), mirroring
 * `invoices/page.tsx`. `category`/`pricingMode`/`status` use
 * `SelectFilterField`; `q` is a plain text `<Input>` matching
 * `customers/page.tsx`'s search field. The form also re-declares `sort`/`dir`
 * via `HiddenParams` — mirroring `customers/page.tsx` — so submitting a
 * filter doesn't silently reset the column the user is sorted by (a native
 * GET submit replaces the WHOLE query string with only the form's own
 * fields).
 *
 * Sortable columns: Nombre, Categoría, Precio, Estado — see
 * `CATALOG_PRODUCT_SORT_KEYS`'s doc comment in `lib/services/ports.ts` for
 * what "Precio" means across the five pricing modes.
 *
 * Creating and editing both happen in a MODAL
 * (`components/domain/catalogo/catalog-product-form-dialog.tsx`), never on a
 * page of their own — the same shape as Inventario, since it is the same
 * task for the user. Each row's Acciones cell holds that dialog plus the
 * delete button, which only admins see.
 */

const PAGE_SIZE = 20;

const PRICING_MODES: PricingMode[] = ["fixed", "variant", "package", "tiered", "area"];

const CATALOG_DEFAULT_SORT: Sort<(typeof CATALOG_PRODUCT_SORT_KEYS)[number]> = { sortBy: "name", sortDir: "asc" };

type CatalogoPageProps = {
  searchParams: Promise<{
    q?: string;
    category?: string;
    pricingMode?: string;
    status?: string;
    sort?: string;
    dir?: string;
    page?: string;
  }>;
};

function parsePricingModeParam(raw: string | undefined): PricingMode | undefined {
  return raw && (PRICING_MODES as string[]).includes(raw) ? (raw as PricingMode) : undefined;
}

function parseStatusParam(raw: string | undefined): "active" | "inactive" | undefined {
  return raw === "active" || raw === "inactive" ? raw : undefined;
}

/** The list row's "Precio" column — only `fixed`/`area` carry a price on the summary row itself; the rest show their variant count (the detail page has the full range). */
function PriceCell({ product }: { product: CatalogProductSummary }) {
  switch (product.pricingMode) {
    case "fixed":
      return <MoneyAmount cents={product.fixedUnitPrice ?? 0} />;
    case "area":
      return (
        <span className="text-sm">
          {formatCOP(product.areaBasePrice ?? 0)} + {formatCOP(product.areaRatePerM2 ?? 0)}/m²
        </span>
      );
    default:
      return (
        <span className="text-sm text-muted-foreground">
          {product.variantCount} {product.variantCount === 1 ? "variante" : "variantes"}
        </span>
      );
  }
}

/** `package`/`tiered` never store a `minOrderQuantity` — it is derived per-variant (see the migration's header comment). */
function MinOrderCell({ product }: { product: CatalogProductSummary }) {
  if (product.pricingMode === "package" || product.pricingMode === "tiered") {
    return <span className="text-sm text-muted-foreground">Según variante</span>;
  }
  return <span className="text-sm">{product.minOrderQuantity}</span>;
}

export default async function CatalogoPage({ searchParams }: CatalogoPageProps) {
  await loadStoreFromCookie();
  const session = await requireSessionOrRedirect();

  if (!(await isCatalogEnabled(session.businessId))) {
    notFound();
  }

  const params = await searchParams;
  const pricingMode = parsePricingModeParam(params.pricingMode);
  const status = parseStatusParam(params.status);
  const sort = parseSortParams(params.sort, params.dir, CATALOG_PRODUCT_SORT_KEYS, CATALOG_DEFAULT_SORT);

  // UX only — requireCapability("deleteRecords") on the route is the gate.
  const canDelete = canDeleteRecords(session.role);

  const [result, categories] = await Promise.all([
    listCatalogProducts(session, {
      q: params.q || undefined,
      category: params.category || undefined,
      pricingMode,
      status,
      sortBy: sort.sortBy,
      sortDir: sort.sortDir,
      page: parsePageParam(params.page),
      pageSize: PAGE_SIZE,
    }),
    listCatalogCategories(session),
  ]);

  const sortHeaderProps = {
    current: sort,
    defaultSort: CATALOG_DEFAULT_SORT,
    pathname: "/catalogo",
    params,
  };

  return (
    <PageShell>
      <PageHeader
        title="Catálogo"
        description="El listado de precios de lo que vendes — distinto de tu inventario."
        actions={
          <CatalogProductFormDialog
            mode="create"
            categories={categories}
            trigger={
              <Button className="w-full sm:w-auto">
                <Plus className="size-4" />
                Nuevo producto
              </Button>
            }
          />
        }
      />

      <form
        method="get"
        className="grid grid-cols-1 items-end gap-2 sm:grid-cols-2 lg:grid-cols-[minmax(12rem,1fr)_10rem_10rem_10rem_auto]"
      >
        <div className="flex min-w-0 flex-col gap-1.5">
          <label htmlFor="q" className="text-sm text-muted-foreground">
            Buscar
          </label>
          <Input id="q" name="q" defaultValue={params.q ?? ""} placeholder="Nombre" className="w-full" />
        </div>
        <div className="flex min-w-0 flex-col gap-1.5">
          <label htmlFor="category" className="text-sm text-muted-foreground">
            Categoría
          </label>
          <SelectFilterField
            id="category"
            name="category"
            defaultValue={params.category ?? ""}
            options={categories.map((category) => ({ value: category, label: category }))}
          />
        </div>
        <div className="flex min-w-0 flex-col gap-1.5">
          <label htmlFor="pricingMode" className="text-sm text-muted-foreground">
            Modo de precio
          </label>
          <SelectFilterField
            id="pricingMode"
            name="pricingMode"
            defaultValue={pricingMode ?? ""}
            options={PRICING_MODES.map((mode) => ({ value: mode, label: PRICING_MODE_LABELS[mode] }))}
          />
        </div>
        <div className="flex min-w-0 flex-col gap-1.5">
          <label htmlFor="status" className="text-sm text-muted-foreground">
            Estado
          </label>
          <SelectFilterField
            id="status"
            name="status"
            defaultValue={status ?? ""}
            options={[
              { value: "active", label: "Activos" },
              { value: "inactive", label: "Inactivos" },
            ]}
          />
        </div>
        {/* Not `page`: filtering should reset to the first page. */}
        <HiddenParams params={{ sort: params.sort, dir: params.dir }} />
        <Button type="submit" variant="outline" className="w-full sm:w-auto">
          Filtrar
        </Button>
      </form>

      <Table className="min-w-[820px]">
        <TableHeader>
          <TableRow>
            <TableSortHeader label="Nombre" sortBy="name" {...sortHeaderProps} />
            <TableSortHeader label="Categoría" sortBy="category" {...sortHeaderProps} />
            <TableHead>Modo</TableHead>
            <TableSortHeader label="Precio" sortBy="price" firstDir="desc" {...sortHeaderProps} />
            <TableHead>Mín. pedido</TableHead>
            <TableSortHeader label="Estado" sortBy="status" {...sortHeaderProps} />
            <TableHead className="text-right">Acciones</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {result.data.length === 0 ? (
            <TableRow>
              <TableCell colSpan={7} className="text-center text-muted-foreground">
                No se encontraron productos de catálogo.
              </TableCell>
            </TableRow>
          ) : (
            result.data.map((product) => (
              <TableRow key={product.id}>
                <TableCell>
                  <Link href={`/catalogo/${product.id}`} className="font-medium hover:underline">
                    {product.name}
                  </Link>
                </TableCell>
                <TableCell>{product.category ?? "-"}</TableCell>
                <TableCell>
                  {/* Most businesses only ever use "fixed" — badging every row with it is noise. */}
                  {product.pricingMode !== "fixed" ? <PricingModeBadge mode={product.pricingMode} /> : null}
                </TableCell>
                <TableCell>
                  <PriceCell product={product} />
                </TableCell>
                <TableCell>
                  <MinOrderCell product={product} />
                </TableCell>
                <TableCell>
                  <Badge variant={product.active ? "success" : "outline"}>
                    {product.active ? "Activo" : "Inactivo"}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-1">
                    <CatalogProductFormDialog
                      mode="edit"
                      productId={product.id}
                      categories={categories}
                      trigger={
                        <Button variant="ghost" size="icon-sm" aria-label={`Editar ${product.name}`}>
                          <Pencil />
                        </Button>
                      }
                    />
                    {canDelete ? (
                      <DeleteCatalogProductButton
                        productId={product.id}
                        productName={product.name}
                        productActive={product.active}
                      />
                    ) : null}
                  </div>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>

      <TablePagination
        page={result.page}
        pageSize={result.pageSize}
        total={result.total}
        pathname="/catalogo"
        params={params}
        itemLabel="productos"
      />
    </PageShell>
  );
}
