import { Plus } from "lucide-react";
import { requireSessionOrRedirect } from "@/lib/session";
import { loadStoreFromCookie } from "@/lib/mock/cookie-persistence";
import { listProducts } from "@/lib/services/product-service";
import { canDeleteRecords } from "@/lib/services/permissions";
import { productSorter } from "@/lib/services/sorting";
import { parsePageParam } from "@/lib/pagination";
import { PageShell } from "@/components/ui/page-shell";
import { PageHeader } from "@/components/domain/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
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
 */
const PAGE_SIZE = 20;

type InventarioPageProps = {
  searchParams: Promise<{ productsSort?: string; productsDir?: string; productsPage?: string }>;
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

  const productsResult = await listProducts(session, {
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
        // Built explicitly, so the sort params must be listed here or paging
        // would silently drop the column the user is sorting by.
        params={{
          productsPage: params.productsPage,
          productsSort: params.productsSort,
          productsDir: params.productsDir,
        }}
        itemLabel="productos"
      />
    </PageShell>
  );
}
