import { Plus } from "lucide-react";
import { requireSessionOrRedirect } from "@/lib/session";
import { loadStoreFromCookie } from "@/lib/mock/cookie-persistence";
import { listProducts } from "@/lib/services/product-service";
import { canDeleteRecords } from "@/lib/services/permissions";
import { productSorter } from "@/lib/services/sorting";
import { parsePageParam } from "@/lib/pagination";
import type { ProductStockFilter } from "@/lib/services/ports";
import { PageShell } from "@/components/ui/page-shell";
import { PageHeader } from "@/components/domain/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { HiddenParams } from "@/components/domain/filters/hidden-params";
import { SelectFilterField } from "@/components/domain/filters/select-filter-field";
import { MoneyAmount } from "@/components/domain/money-amount";
import { TablePagination } from "@/components/domain/table-pagination";
import { TableSortHeader } from "@/components/domain/table-sort-header";
import ProductFormDialog from "@/components/domain/inventario/product-form-dialog";
import DeleteProductButton from "@/components/domain/inventario/delete-product-button";

/**
 * Inventario (stock tracking) screen — simplified to Products-only (the
 * former Movimientos tab, and its "Registrar movimiento" dialog, were
 * removed: quantity is now adjusted directly from the product form via an
 * inline "Cantidad" field, which posts a matching `in`/`out` inventory
 * movement behind the scenes — see `product-form-dialog-content.tsx`'s doc
 * comment). NOT role-gated — `requireSessionOrRedirect()` is the ONLY gate
 * (any authenticated session, any role, may view/use this page).
 *
 * Each product row's low-stock flag (`product.isLowStock`) is computed
 * server-side from a FIXED rule (`1 <= currentQuantity <= 3`, see
 * `lib/services/inventory-stock.ts`) — no per-product threshold.
 *
 * Productos paginates via its own `?productsPage=` search param (real
 * pagination — see `components/domain/table-pagination.tsx`).
 *
 * Filters are a plain `<form method="get">` (never client state), mirroring
 * `catalogo/page.tsx`: a text `<Input>` for `q` (name-only — deliberately NOT
 * extended to `sku`) and `SelectFilterField`s for `status` and `stock`. Every
 * one of this page's own params — including these new filter params — stays
 * namespaced with the pre-existing `products` prefix
 * (`productsQ`/`productsStatus`/`productsStock`, alongside
 * `productsSort`/`productsDir`/`productsPage`), even though the Movimientos
 * tab that originally justified the namespacing is gone: it is still this
 * page's established convention, and keeps every param it owns visually
 * grouped. The form re-declares `productsSort`/`productsDir` via
 * `HiddenParams` (never `productsPage` — filtering resets to page 1), and
 * `TablePagination`'s explicit `params` object lists the filter params too, so
 * paging preserves them.
 *
 * `stock` (`ProductStockFilter`, `lib/services/ports.ts`) needs zero new
 * repository logic beyond the filter itself: it reuses the SAME derived
 * `currentQuantity`/`isLowStock` fields this page already renders, never a
 * re-derived threshold.
 */
const PAGE_SIZE = 20;

const STOCK_FILTER_LABELS: Record<ProductStockFilter, string> = {
  in_stock: "Con stock",
  low_stock: "Stock bajo (1 a 3)",
  out_of_stock: "Sin stock",
};

const STOCK_FILTERS: ProductStockFilter[] = ["in_stock", "low_stock", "out_of_stock"];

function parseStatusParam(raw: string | undefined): "active" | "inactive" | undefined {
  return raw === "active" || raw === "inactive" ? raw : undefined;
}

function parseStockParam(raw: string | undefined): ProductStockFilter | undefined {
  return raw && (STOCK_FILTERS as string[]).includes(raw) ? (raw as ProductStockFilter) : undefined;
}

type InventarioPageProps = {
  searchParams: Promise<{
    productsQ?: string;
    productsStatus?: string;
    productsStock?: string;
    productsSort?: string;
    productsDir?: string;
    productsPage?: string;
  }>;
};

export default async function InventarioPage({ searchParams }: InventarioPageProps) {
  await loadStoreFromCookie();
  const session = await requireSessionOrRedirect();
  const params = await searchParams;
  // UX only — `requireCapability("deleteRecords")` on
  // `DELETE /api/products/{id}` is the enforcing gate. The rest of this page
  // stays un-gated per the "No Role Gating on Inventory" rule.
  const canDelete = canDeleteRecords(session.role);

  // Namespaced params, mirroring the existing `productsPage` convention.
  const sort = productSorter.parse(params.productsSort, params.productsDir);
  const status = parseStatusParam(params.productsStatus);
  const stock = parseStockParam(params.productsStock);

  const productsResult = await listProducts(session, {
    q: params.productsQ || undefined,
    status,
    stock,
    sortBy: sort.sortBy,
    sortDir: sort.sortDir,
    page: parsePageParam(params.productsPage),
    pageSize: PAGE_SIZE,
  });

  const sortHeaderProps = {
    current: sort,
    defaultSort: productSorter.defaultSort,
    pathname: "/inventario",
    params,
    sortParam: "productsSort",
    dirParam: "productsDir",
    pageParam: "productsPage",
  };

  return (
    <PageShell>
      <PageHeader
        title="Inventario"
        description="Gestiona tus productos y su cantidad en stock."
        actions={
          <ProductFormDialog
            mode="create"
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
        className="grid grid-cols-1 items-end gap-2 sm:grid-cols-2 lg:grid-cols-[minmax(12rem,1fr)_10rem_10rem_auto]"
      >
        <div className="flex min-w-0 flex-col gap-1.5">
          <label htmlFor="productsQ" className="text-sm text-muted-foreground">
            Buscar
          </label>
          <Input id="productsQ" name="productsQ" defaultValue={params.productsQ ?? ""} placeholder="Nombre" className="w-full" />
        </div>
        <div className="flex min-w-0 flex-col gap-1.5">
          <label htmlFor="productsStatus" className="text-sm text-muted-foreground">
            Estado
          </label>
          <SelectFilterField
            id="productsStatus"
            name="productsStatus"
            defaultValue={status ?? ""}
            options={[
              { value: "active", label: "Activos" },
              { value: "inactive", label: "Inactivos" },
            ]}
          />
        </div>
        <div className="flex min-w-0 flex-col gap-1.5">
          <label htmlFor="productsStock" className="text-sm text-muted-foreground">
            Stock
          </label>
          <SelectFilterField
            id="productsStock"
            name="productsStock"
            defaultValue={stock ?? ""}
            options={STOCK_FILTERS.map((value) => ({ value, label: STOCK_FILTER_LABELS[value] }))}
          />
        </div>
        {/* Not `productsPage`: filtering should reset to the first page. */}
        <HiddenParams params={{ productsSort: params.productsSort, productsDir: params.productsDir }} />
        <Button type="submit" variant="outline" className="w-full sm:w-auto">
          Filtrar
        </Button>
      </form>

      <Table className="min-w-[760px]">
        <TableHeader>
          <TableRow>
            <TableSortHeader label="Nombre" sortBy="name" {...sortHeaderProps} />
            <TableSortHeader label="Referencia" sortBy="sku" {...sortHeaderProps} />
            <TableSortHeader label="Costo unitario" sortBy="unitCost" firstDir="desc" align="right" {...sortHeaderProps} />
            <TableSortHeader label="Cantidad" sortBy="currentQuantity" firstDir="desc" align="right" {...sortHeaderProps} />
            <TableSortHeader label="Valor total" sortBy="totalValue" firstDir="desc" align="right" {...sortHeaderProps} />
            <TableSortHeader label="Estado" sortBy="status" {...sortHeaderProps} />
            <TableHead className="text-right">Acciones</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {productsResult.data.length === 0 ? (
            <TableRow>
              <TableCell colSpan={7} className="text-center text-muted-foreground">
                No se encontraron productos.
              </TableCell>
            </TableRow>
          ) : (
            productsResult.data.map((product) => (
              <TableRow key={product.id}>
                <TableCell className="font-medium">
                  <div className="flex items-center gap-2">
                    <span>{product.name}</span>
                    {product.isLowStock ? <Badge variant="warning">Stock bajo</Badge> : null}
                  </div>
                </TableCell>
                <TableCell>{product.sku ?? "-"}</TableCell>
                <TableCell className="text-right">
                  <MoneyAmount cents={product.unitCost} />
                </TableCell>
                <TableCell className="text-right">{product.currentQuantity}</TableCell>
                <TableCell className="text-right">
                  <MoneyAmount cents={product.totalValue} />
                </TableCell>
                <TableCell>
                  <Badge variant={product.active ? "success" : "outline"}>
                    {product.active ? "Activo" : "Inactivo"}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-1">
                    <ProductFormDialog
                      mode="edit"
                      product={product}
                      trigger={
                        <Button variant="ghost" size="sm">
                          Editar
                        </Button>
                      }
                    />
                    {canDelete ? (
                      <DeleteProductButton
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
        page={productsResult.page}
        pageSize={productsResult.pageSize}
        total={productsResult.total}
        pathname="/inventario"
        paramName="productsPage"
        // Built explicitly, so the sort AND filter params must be listed here
        // or paging would silently drop them.
        params={{
          productsPage: params.productsPage,
          productsSort: params.productsSort,
          productsDir: params.productsDir,
          productsQ: params.productsQ,
          productsStatus: params.productsStatus,
          productsStock: params.productsStock,
        }}
        itemLabel="productos"
      />
    </PageShell>
  );
}
