import { requireSessionOrRedirect } from "@/lib/session";
import { loadStoreFromCookie } from "@/lib/mock/cookie-persistence";
import { listProducts } from "@/lib/services/product-service";
import { listMovements } from "@/lib/services/inventory-service";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsPanel, TabsTab } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { MoneyAmount } from "@/components/domain/money-amount";
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
 * second query. Each product row's low-stock flag compares its OWN computed
 * `currentQuantity` against its OWN `minStockThreshold` — never a shared/
 * global value.
 */

/**
 * Intentional MVP limitation: this is a hard display cap, NOT real
 * pagination — mirrors Nomina's `MAX_DISPLAYED_ROWS` precedent exactly.
 */
const MAX_DISPLAYED_ROWS = 50;

export default async function InventarioPage() {
  await loadStoreFromCookie();
  const session = await requireSessionOrRedirect();

  const [productsResult, movementsResult] = await Promise.all([
    listProducts(session, { page: 1, pageSize: MAX_DISPLAYED_ROWS }),
    listMovements(session, { page: 1, pageSize: MAX_DISPLAYED_ROWS }),
  ]);

  const activeProducts = productsResult.data
    .filter((product) => product.active)
    .map((product) => ({ id: product.id, name: product.name }));

  return (
    <div className="flex flex-1 flex-col gap-4 p-4">
      <div>
        <h1 className="text-lg font-semibold">Inventario</h1>
        <p className="text-sm text-muted-foreground">Gestiona productos y registra movimientos de stock.</p>
      </div>

      <Tabs defaultValue="productos">
        <TabsList>
          <TabsTab value="productos">Productos</TabsTab>
          <TabsTab value="movimientos">Movimientos</TabsTab>
        </TabsList>

        {/* keepMounted is required: do not remove, matches nomina/page.tsx's
            established mechanic — see that file's comment for the full
            rationale (base-ui's default unmounts inactive panels). */}
        <TabsPanel value="productos" keepMounted>
          <div className="flex items-center justify-end">
            <ProductFormDialog mode="create" trigger={<Button>Nuevo producto</Button>} />
          </div>
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
                        {product.isLowStock ? <Badge variant="destructive">Stock bajo</Badge> : null}
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
                      <Badge variant={product.active ? "default" : "outline"}>
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
        </TabsPanel>

        {/* keepMounted is required: do not remove — see the Productos panel's comment above. */}
        <TabsPanel value="movimientos" keepMounted>
          <div className="flex items-center justify-end">
            <MovementFormDialog products={activeProducts} trigger={<Button>Registrar movimiento</Button>} />
          </div>
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
                      <Badge variant={movement.type === "in" ? "default" : "outline"}>
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
        </TabsPanel>
      </Tabs>
    </div>
  );
}
