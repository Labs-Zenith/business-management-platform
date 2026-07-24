import { Plus } from "lucide-react";
import { requireSessionOrRedirect } from "@/lib/session";
import { loadStoreFromCookie } from "@/lib/mock/cookie-persistence";
import { listProducts } from "@/lib/services/product-service";
import { parsePageParam } from "@/lib/pagination";
import { PageShell } from "@/components/ui/page-shell";
import { PageHeader } from "@/components/domain/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { MoneyAmount } from "@/components/domain/money-amount";
import { TablePagination } from "@/components/domain/table-pagination";
import ProductFormDialog from "@/components/domain/inventario/product-form-dialog";

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
  searchParams: Promise<{ productsPage?: string }>;
};

export default async function InventarioPage({ searchParams }: InventarioPageProps) {
  await loadStoreFromCookie();
  const session = await requireSessionOrRedirect();
  const params = await searchParams;

  const productsResult = await listProducts(session, {
    page: parsePageParam(params.productsPage),
    pageSize: PAGE_SIZE,
  });

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
            <TableHead>Nombre</TableHead>
            <TableHead>Referencia</TableHead>
            <TableHead className="text-right">Costo unitario</TableHead>
            <TableHead className="text-right">Cantidad</TableHead>
            <TableHead className="text-right">Valor total</TableHead>
            <TableHead>Estado</TableHead>
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
                  <ProductFormDialog
                    mode="edit"
                    product={product}
                    trigger={
                      <Button variant="ghost" size="sm">
                        Editar
                      </Button>
                    }
                  />
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
        params={{ productsPage: params.productsPage }}
        itemLabel="productos"
      />
    </PageShell>
  );
}
