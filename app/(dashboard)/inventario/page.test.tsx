import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type {
  InventoryMovementListQuery,
  InventoryMovementWithProduct,
  Paged,
  ProductListQuery,
  ProductWithStock,
  Session,
} from "@/lib/services/ports";

/**
 * `app/(dashboard)/inventario/page.tsx`, per
 * `openspec/changes/inventario/specs/inventory-tracking/spec.md`'s "No Role
 * Gating on Inventory" requirement — unlike `nomina/page.test.tsx`'s
 * `notFound()`-for-a-denied-role test, there is no role check here at all:
 * any authenticated session renders full page content. Mirrors
 * `nomina/page.test.tsx`'s Tabs+keepMounted assertions and lazy-dialog stub
 * conventions otherwise.
 */

const mockRequireSessionOrRedirect = vi.fn<() => Promise<Session>>();
const mockListProducts = vi.fn<(session: Session, query: ProductListQuery) => Promise<Paged<ProductWithStock>>>();
const mockListMovements =
  vi.fn<(session: Session, query: InventoryMovementListQuery) => Promise<Paged<InventoryMovementWithProduct>>>();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

vi.mock("@/lib/mock/cookie-persistence", () => ({
  loadStoreFromCookie: vi.fn().mockResolvedValue(undefined),
  saveStoreToCookie: vi.fn(),
}));

vi.mock("@/lib/session", () => ({
  requireSessionOrRedirect: () => mockRequireSessionOrRedirect(),
}));

vi.mock("@/lib/services/product-service", () => ({
  listProducts: (session: Session, query: ProductListQuery) => mockListProducts(session, query),
}));

vi.mock("@/lib/services/inventory-service", () => ({
  listMovements: (session: Session, query: InventoryMovementListQuery) => mockListMovements(session, query),
}));

// Dialogs are lazy (`dynamic(..., {ssr:false})`) via `./product-form-dialog`
// / `./movement-form-dialog` — stubbed to their trigger only, mirroring
// `nomina/page.test.tsx`'s "sections aren't rendered/DOM-tested individually"
// convention; the dialogs have their own `.test.tsx` files.
vi.mock("@/components/domain/inventario/product-form-dialog", () => ({
  default: ({ trigger }: { trigger: ReactNode }) => trigger,
}));
// Renders the trigger AND a hidden marker exposing the `products` prop it
// received, so this file's "only active products" test can assert on the
// filtered list actually threaded down from the page, without needing the
// dialog's own (separately tested) internals.
vi.mock("@/components/domain/inventario/movement-form-dialog", () => ({
  default: ({ trigger, products }: { trigger: ReactNode; products: Array<{ id: string; name: string }> }) => (
    <>
      {trigger}
      <div data-testid="movement-dialog-products">{JSON.stringify(products)}</div>
    </>
  ),
}));

import InventarioPage from "./page";

const SESSION: Session = {
  userId: "20000000-0000-4000-8000-000000000001",
  businessId: "10000000-0000-4000-8000-000000000001",
  email: "demo@negociodemo.test",
  role: "worker",
};

const LOW_STOCK_PRODUCT: ProductWithStock = {
  id: "80000000-0000-4000-8000-000000000001",
  businessId: SESSION.businessId,
  name: "Tornillos 1/4",
  sku: "TOR-14",
  unitCost: 500,
  active: true,
  createdAt: "2024-01-01T00:00:00.000Z",
  updatedAt: "2024-01-01T00:00:00.000Z",
  currentQuantity: 2,
  totalValue: 1000,
  isLowStock: true,
};

const HEALTHY_PRODUCT: ProductWithStock = {
  id: "80000000-0000-4000-8000-000000000002",
  businessId: SESSION.businessId,
  name: "Martillos",
  sku: null,
  unitCost: 25_000,
  active: true,
  createdAt: "2024-01-01T00:00:00.000Z",
  updatedAt: "2024-01-01T00:00:00.000Z",
  currentQuantity: 8,
  totalValue: 200_000,
  isLowStock: false,
};

const MOVEMENT: InventoryMovementWithProduct = {
  id: "90000000-0000-4000-8000-000000000001",
  businessId: SESSION.businessId,
  productId: LOW_STOCK_PRODUCT.id,
  type: "out",
  typeId: "c4000000-0000-4000-8000-000000000002",
  quantity: 6,
  note: "Venta mostrador",
  createdAt: "2026-07-10T00:00:00.000Z",
  product: { id: LOW_STOCK_PRODUCT.id, name: LOW_STOCK_PRODUCT.name },
};

describe("InventarioPage", () => {
  beforeEach(() => {
    mockRequireSessionOrRedirect.mockReset();
    mockListProducts.mockReset();
    mockListMovements.mockReset();
  });

  it("gates on requireSessionOrRedirect() only (no capability check) and renders both Productos/Movimientos tab content (keepMounted) for any session", async () => {
    mockRequireSessionOrRedirect.mockResolvedValue(SESSION);
    mockListProducts.mockResolvedValue({ data: [LOW_STOCK_PRODUCT, HEALTHY_PRODUCT], page: 1, pageSize: 50, total: 2 });
    mockListMovements.mockResolvedValue({ data: [MOVEMENT], page: 1, pageSize: 50, total: 1 });

    render(await InventarioPage());

    expect(mockRequireSessionOrRedirect).toHaveBeenCalledTimes(1);

    // Productos tab (active by default). "Tornillos 1/4" appears TWICE — once
    // as the product row (active panel) and once as the movement row's
    // product name (Movimientos panel, keepMounted) — proving both panels are
    // genuinely rendered simultaneously, not just the active one. Mirrors
    // `nomina/page.test.tsx`'s identical "Ana Empleada" duplication rationale.
    expect(screen.getAllByText("Tornillos 1/4")).toHaveLength(2);
    expect(screen.getByText("Martillos")).toBeInTheDocument();

    // Movimientos tab content is ALSO present (keepMounted), even though inactive.
    expect(screen.getByText("Venta mostrador")).toBeInTheDocument();
  });

  it("flags a product within the fixed 1-3 low-stock range, and does not flag a healthy one above that range", async () => {
    mockRequireSessionOrRedirect.mockResolvedValue(SESSION);
    mockListProducts.mockResolvedValue({ data: [LOW_STOCK_PRODUCT, HEALTHY_PRODUCT], page: 1, pageSize: 50, total: 2 });
    mockListMovements.mockResolvedValue({ data: [], page: 1, pageSize: 50, total: 0 });

    render(await InventarioPage());

    const lowStockRow = screen.getByText("Tornillos 1/4").closest("tr");
    expect(lowStockRow).not.toBeNull();
    expect(lowStockRow!).toHaveTextContent("Stock bajo");

    const healthyRow = screen.getByText("Martillos").closest("tr");
    expect(healthyRow).not.toBeNull();
    expect(healthyRow!).not.toHaveTextContent("Stock bajo");
  });

  it("shows empty states when there are no products or movements", async () => {
    mockRequireSessionOrRedirect.mockResolvedValue(SESSION);
    mockListProducts.mockResolvedValue({ data: [], page: 1, pageSize: 50, total: 0 });
    mockListMovements.mockResolvedValue({ data: [], page: 1, pageSize: 50, total: 0 });

    render(await InventarioPage());

    expect(screen.getByText(/no se encontraron productos/i)).toBeInTheDocument();
    expect(screen.getByText(/no se encontraron movimientos/i)).toBeInTheDocument();
  });

  it("offers the 'Nuevo producto' and 'Registrar movimiento' quick actions", async () => {
    mockRequireSessionOrRedirect.mockResolvedValue(SESSION);
    mockListProducts.mockResolvedValue({ data: [], page: 1, pageSize: 50, total: 0 });
    mockListMovements.mockResolvedValue({ data: [], page: 1, pageSize: 50, total: 0 });

    render(await InventarioPage());

    expect(screen.getByRole("button", { name: "Nuevo producto" })).toBeInTheDocument();
    // "Registrar movimiento" lives in the (keepMounted but currently inactive)
    // Movimientos panel — base-ui marks it `hidden`, so it's excluded from
    // the accessibility tree by default; `{ hidden: true }` proves it is
    // still genuinely present in the DOM (keepMounted), not discarded.
    expect(screen.getByRole("button", { name: "Registrar movimiento", hidden: true })).toBeInTheDocument();
  });

  it("only offers ACTIVE products to the Registrar movimiento dialog", async () => {
    mockRequireSessionOrRedirect.mockResolvedValue(SESSION);
    const inactiveProduct: ProductWithStock = {
      ...HEALTHY_PRODUCT,
      id: "80000000-0000-4000-8000-000000000003",
      active: false,
    };
    mockListProducts.mockResolvedValue({
      data: [LOW_STOCK_PRODUCT, inactiveProduct],
      page: 1,
      pageSize: 50,
      total: 2,
    });
    mockListMovements.mockResolvedValue({ data: [], page: 1, pageSize: 50, total: 0 });

    render(await InventarioPage());

    const productsProp = JSON.parse(screen.getByTestId("movement-dialog-products").textContent ?? "[]") as Array<{
      id: string;
      name: string;
    }>;
    expect(productsProp).toEqual([{ id: LOW_STOCK_PRODUCT.id, name: LOW_STOCK_PRODUCT.name }]);
  });

  it("threads an empty products array to the Registrar movimiento dialog when every product is inactive", async () => {
    mockRequireSessionOrRedirect.mockResolvedValue(SESSION);
    const inactiveLowStock: ProductWithStock = { ...LOW_STOCK_PRODUCT, active: false };
    const inactiveHealthy: ProductWithStock = { ...HEALTHY_PRODUCT, active: false };
    mockListProducts.mockResolvedValue({
      data: [inactiveLowStock, inactiveHealthy],
      page: 1,
      pageSize: 50,
      total: 2,
    });
    mockListMovements.mockResolvedValue({ data: [], page: 1, pageSize: 50, total: 0 });

    render(await InventarioPage());

    const productsProp = JSON.parse(screen.getByTestId("movement-dialog-products").textContent ?? "[]") as Array<{
      id: string;
      name: string;
    }>;
    expect(productsProp).toEqual([]);
  });
});
