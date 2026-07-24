import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { Paged, ProductListQuery, ProductWithStock, Session } from "@/lib/services/ports";

/**
 * `app/(dashboard)/inventario/page.tsx`, per
 * `openspec/changes/inventario/specs/inventory-tracking/spec.md`'s "No Role
 * Gating on Inventory" requirement — any authenticated session renders full
 * page content, no capability check. Products-only (the former
 * Movimientos tab and its "Registrar movimiento" dialog were removed —
 * quantity is now adjusted inline via the product form's "Cantidad" field,
 * see `product-form-dialog-content.tsx`).
 */

const mockRequireSessionOrRedirect = vi.fn<() => Promise<Session>>();
const mockListProducts = vi.fn<(session: Session, query: ProductListQuery) => Promise<Paged<ProductWithStock>>>();

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

// The dialog is lazy (`dynamic(..., {ssr:false})`) via `./product-form-dialog`
// — stubbed to its trigger only, mirroring `nomina/page.test.tsx`'s
// "sections aren't rendered/DOM-tested individually" convention; the dialog
// has its own `.test.tsx` file.
vi.mock("@/components/domain/inventario/product-form-dialog", () => ({
  default: ({ trigger }: { trigger: ReactNode }) => trigger,
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

describe("InventarioPage", () => {
  beforeEach(() => {
    mockRequireSessionOrRedirect.mockReset();
    mockListProducts.mockReset();
  });

  it("gates on requireSessionOrRedirect() only (no capability check) and renders the Productos table for any session", async () => {
    mockRequireSessionOrRedirect.mockResolvedValue(SESSION);
    mockListProducts.mockResolvedValue({ data: [LOW_STOCK_PRODUCT, HEALTHY_PRODUCT], page: 1, pageSize: 50, total: 2 });

    render(await InventarioPage({ searchParams: Promise.resolve({}) }));

    expect(mockRequireSessionOrRedirect).toHaveBeenCalledTimes(1);
    expect(mockListProducts).toHaveBeenCalledWith(SESSION, { page: 1, pageSize: 20 });

    expect(screen.getByText("Tornillos 1/4")).toBeInTheDocument();
    expect(screen.getByText("Martillos")).toBeInTheDocument();
  });

  it("renders a 'Referencia' header (not 'SKU'), and no Tabs/Movimientos content", async () => {
    mockRequireSessionOrRedirect.mockResolvedValue(SESSION);
    mockListProducts.mockResolvedValue({ data: [LOW_STOCK_PRODUCT], page: 1, pageSize: 50, total: 1 });

    render(await InventarioPage({ searchParams: Promise.resolve({}) }));

    expect(screen.getByText("Referencia")).toBeInTheDocument();
    expect(screen.queryByText("SKU")).not.toBeInTheDocument();
    expect(screen.queryByText("Movimientos")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Registrar movimiento" })).not.toBeInTheDocument();
    expect(screen.queryByRole("tablist")).not.toBeInTheDocument();
  });

  it("flags a product within the fixed 1-3 low-stock range, and does not flag a healthy one above that range", async () => {
    mockRequireSessionOrRedirect.mockResolvedValue(SESSION);
    mockListProducts.mockResolvedValue({ data: [LOW_STOCK_PRODUCT, HEALTHY_PRODUCT], page: 1, pageSize: 50, total: 2 });

    render(await InventarioPage({ searchParams: Promise.resolve({}) }));

    const lowStockRow = screen.getByText("Tornillos 1/4").closest("tr");
    expect(lowStockRow).not.toBeNull();
    expect(lowStockRow!).toHaveTextContent("Stock bajo");

    const healthyRow = screen.getByText("Martillos").closest("tr");
    expect(healthyRow).not.toBeNull();
    expect(healthyRow!).not.toHaveTextContent("Stock bajo");
  });

  it("shows an empty state when there are no products", async () => {
    mockRequireSessionOrRedirect.mockResolvedValue(SESSION);
    mockListProducts.mockResolvedValue({ data: [], page: 1, pageSize: 50, total: 0 });

    render(await InventarioPage({ searchParams: Promise.resolve({}) }));

    expect(screen.getByText(/no se encontraron productos/i)).toBeInTheDocument();
  });

  it("offers the 'Nuevo producto' quick action", async () => {
    mockRequireSessionOrRedirect.mockResolvedValue(SESSION);
    mockListProducts.mockResolvedValue({ data: [], page: 1, pageSize: 50, total: 0 });

    render(await InventarioPage({ searchParams: Promise.resolve({}) }));

    expect(screen.getByRole("button", { name: "Nuevo producto" })).toBeInTheDocument();
  });

  it("parses productsPage and threads it (and only it) to the Productos pagination links", async () => {
    mockRequireSessionOrRedirect.mockResolvedValue(SESSION);
    mockListProducts.mockResolvedValue({ data: [LOW_STOCK_PRODUCT], page: 3, pageSize: 20, total: 100 });

    render(await InventarioPage({ searchParams: Promise.resolve({ productsPage: "3" }) }));

    expect(mockListProducts).toHaveBeenCalledWith(SESSION, { page: 3, pageSize: 20 });

    const nextLink = screen.getByRole("link", { name: /siguiente/i });
    expect(nextLink.getAttribute("href")).toBe("/inventario?productsPage=4");
  });
});
