import { Plus } from "lucide-react";
import { requireSessionOrRedirect } from "@/lib/session";
import { loadStoreFromCookie } from "@/lib/mock/cookie-persistence";
import { listProducts } from "@/lib/services/product-service";
import { listMovements } from "@/lib/services/inventory-service";
import { listMovementTypes } from "@/lib/services/catalog-service";
import { parsePageParam } from "@/lib/pagination";
import { PageShell } from "@/components/ui/page-shell";
import { PageHeader } from "@/components/domain/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsPanel, TabsTab } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { MoneyAmount } from "@/components/domain/money-amount";
import { TablePagination } from "@/components/domain/table-pagination";
import ProductFormDialog from "@/components/domain/inventario/product-form-dialog";
import MovementFormDialog from "@/components/domain/inventario/movement-form-dialog";

/**
 * Inventario (stock tracking) screen, per
 * `openspec/changes/inventario/proposal.md`'s Approach and `design.md`'s
 * "Page mirrors Nomina Tabs+keepMounted" decision. Unlike Nomina, this is
 * NOT role-gated — `requireSessionOrRedirect()` is the ONLY gate, per
 * `openspec/changes/inventario/specs/inventory-tracking/spec.md`'s "No Role
 * Gating on Inventory" requirement (any authenticated session, any role, may
 * view/use this page).
 *
 * Mirrors `app/(dashboard)/nomina/page.tsx`'s Tabs+keepMounted structure and
 * Server Component data-fetching shape (fetch via the service directly, not
 * a self-fetch of the API routes — those exist for the client-side mutation
 * dialogs).
 *
 * "Registrar movimiento" only offers ACTIVE products in its select (mirrors
 * Nomina's "Registrar pago" active-employees-only precedent exactly), computed
 * here via a plain filter over the already-fetched Productos list — no
 * second query. Each product row's low-stock flag (`product.isLowStock`) is
 * computed server-side from a FIXED rule (`1 <= currentQuantity <= 3`, see
 * `lib/services/inventory-stock.ts`) — no per-product threshold anymore.
 *
 * Productos/Movimientos each paginate independently via their own
 * `?productsPage=`/`?movementsPage=` search params (real pagination — see
 * `components/domain/table-pagination.tsx`). The active tab is persisted in
 * `?tab=` so a page-link click (a full GET navigation) doesn't bounce the
 * user back to the Productos tab: each `<TablePagination>` below hardcodes
 * the `tab` value for the panel it lives in (omitted for the default
 * Productos tab, `"movimientos"` for the Movimientos one) rather than
 * echoing back whatever `tab` the current URL happened to carry — the tab
 * that panel's controls belong to.
 */
const PAGE_SIZE = 20;

type InventarioPageProps = {
  searchParams: Promise<{ productsPage?: string; movementsPage?: string; tab?: string }>;
};

function parseTabParam(raw: string | undefined): "productos" | "movimientos" {
  return raw === "movimientos" ? "movimientos" : "productos";
}

export default async function InventarioPage({ searchParams }: InventarioPageProps) {
  await loadStoreFromCookie();
  const session = await requireSessionOrRedirect();
  const params = await searchParams;
  const activeTab = parseTabParam(params.tab);

  const [productsResult, movementsResult, movementTypes] = await Promise.all([
    listProducts(session, { page: parsePageParam(params.productsPage), pageSize: PAGE_SIZE }),
    listMovements(session, { page: parsePageParam(params.movementsPage), pageSize: PAGE_SIZE }),
    listMovementTypes(),
  ]);

  const activeProducts = productsResult.data
    .filter((product) => product.active)
    .map((product) => ({ id: product.id, name: product.name }));

  return (
    <PageShell>
      <PageHeader
        title="Inventario"
        description="Gestiona productos y registra movimientos de stock."
        actions={
          <>
            <ProductFormDialog
              mode="create"
              trigger={
                <Button className="w-full sm:w-auto">
                  <Plus className="size-4" />
                  Nuevo producto
                </Button>
              }
            />
            <MovementFormDialog
              products={activeProducts}
              movementTypes={movementTypes.map((type) => ({ id: type.id, code: type.code, label: type.label }))}
              trigger={
                <Button className="w-full sm:w-auto">
                  <Plus className="size-4" />
                  Registrar movimiento
                </Button>
              }
            />
          </>
        }
      />

      <Tabs defaultValue={activeTab}>
        <TabsList>
          <TabsTab value="productos">Productos</TabsTab>
          <TabsTab value="movimientos">Movimientos</TabsTab>
        </TabsList>

        {/* keepMounted is required: do not remove, matches nomina/page.tsx's
            established mechanic — see that file's comment for the full
            rationale (base-ui's default unmounts inactive panels). */}
        <TabsPanel value="productos" keepMounted>
          <Table className="min-w-[760px]">
            <TableHeader>
              <TableRow>
                <TableHead>Nombre</TableHead>
                <TableHead>SKU</TableHead>
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
            params={{ productsPage: params.productsPage, movementsPage: params.movementsPage, tab: undefined }}
            itemLabel="productos"
          />
        </TabsPanel>

        {/* keepMounted is required: do not remove — see the Productos panel's comment above. */}
        <TabsPanel value="movimientos" keepMounted>
          <Table className="min-w-[720px]">
            <TableHeader>
              <TableRow>
                <TableHead>Producto</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead className="text-right">Cantidad</TableHead>
                <TableHead>Nota</TableHead>
                <TableHead>Fecha</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {movementsResult.data.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground">
                    No se encontraron movimientos.
                  </TableCell>
                </TableRow>
              ) : (
                movementsResult.data.map((movement) => (
                  <TableRow key={movement.id}>
                    <TableCell className="font-medium">{movement.product.name}</TableCell>
                    <TableCell>
                      <Badge variant={movement.type === "in" ? "success" : "outline"}>
                        {movement.type === "in" ? "Entrada" : "Salida"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">{movement.quantity}</TableCell>
                    <TableCell>{movement.note ?? "-"}</TableCell>
                    <TableCell>{movement.createdAt.slice(0, 10)}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>

          <TablePagination
            page={movementsResult.page}
            pageSize={movementsResult.pageSize}
            total={movementsResult.total}
            pathname="/inventario"
            paramName="movementsPage"
            params={{ productsPage: params.productsPage, movementsPage: params.movementsPage, tab: "movimientos" }}
            itemLabel="movimientos"
          />
        </TabsPanel>
      </Tabs>
    </PageShell>
  );
}
