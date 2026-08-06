import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { CatalogProductListQuery, CatalogProductSummary, Paged, Session } from "@/lib/services/ports";

/**
 * `app/(dashboard)/catalogo/page.tsx` — the page-level `isCatalogEnabled`
 * gate is the REAL authority for the Catálogo feature (mirrors
 * `ventas/page.test.tsx`'s "gated page" test shape exactly, but gating on the
 * `catalog` feature flag instead of `pipeline`).
 */

const mockRequireSessionOrRedirect = vi.fn<() => Promise<Session>>();
const mockIsCatalogEnabled = vi.fn<(businessId: string) => Promise<boolean>>();
const mockListCatalogProducts = vi.fn<
  (session: Session, query: CatalogProductListQuery) => Promise<Paged<CatalogProductSummary>>
>();
const mockListCatalogCategories = vi.fn<(session: Session) => Promise<string[]>>();

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw Object.assign(new Error("NEXT_HTTP_ERROR_FALLBACK;404"), { digest: "NEXT_HTTP_ERROR_FALLBACK;404" });
  },
}));

vi.mock("@/lib/mock/cookie-persistence", () => ({
  loadStoreFromCookie: vi.fn().mockResolvedValue(undefined),
  saveStoreToCookie: vi.fn(),
}));

vi.mock("@/lib/session", () => ({
  requireSessionOrRedirect: () => mockRequireSessionOrRedirect(),
}));

vi.mock("@/lib/services/features", () => ({
  isCatalogEnabled: (businessId: string) => mockIsCatalogEnabled(businessId),
}));

vi.mock("@/lib/services/product-catalog-service", () => ({
  listCatalogProducts: (session: Session, query: CatalogProductListQuery) => mockListCatalogProducts(session, query),
  listCatalogCategories: (session: Session) => mockListCatalogCategories(session),
}));

// Lazy dialogs (`dynamic(..., {ssr:false})`) — stubbed to their triggers only,
// mirroring `inventario/page.test.tsx`. Each has its own `.test.tsx`.
vi.mock("@/components/domain/catalogo/catalog-product-form-dialog", () => ({
  default: ({ trigger }: { trigger: ReactNode }) => trigger,
}));
vi.mock("@/components/domain/catalogo/delete-catalog-product-button", () => ({
  default: ({ productName }: { productName: string }) => (
    <button type="button" aria-label={`Eliminar ${productName}`} />
  ),
}));

import CatalogoPage from "./page";

const SESSION: Session = {
  userId: "20000000-0000-4000-8000-000000000001",
  businessId: "10000000-0000-4000-8000-000000000001",
  email: "demo@negociodemo.test",
  role: "admin",
};

const FIXED_PRODUCT: CatalogProductSummary = {
  id: "90000000-0000-4000-8000-000000000001",
  businessId: SESSION.businessId,
  name: "Volante A5",
  category: "Volantes",
  description: null,
  pricingMode: "fixed",
  minOrderQuantity: 50,
  fixedUnitPrice: 50_00,
  areaBasePrice: null,
  areaRatePerM2: null,
  areaMinPrice: null,
  active: true,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  variantCount: 0,
};

const PACKAGE_PRODUCT: CatalogProductSummary = {
  ...FIXED_PRODUCT,
  id: "90000000-0000-4000-8000-000000000002",
  name: "Stickers 3x3 cm",
  pricingMode: "package",
  fixedUnitPrice: null,
  variantCount: 2,
};

describe("CatalogoPage", () => {
  beforeEach(() => {
    mockRequireSessionOrRedirect.mockReset();
    mockIsCatalogEnabled.mockReset();
    mockListCatalogProducts.mockReset();
    mockListCatalogCategories.mockReset();
  });

  it("resolves the session, re-checks the catalog feature gate, then renders the scoped product list", async () => {
    mockRequireSessionOrRedirect.mockResolvedValue(SESSION);
    mockIsCatalogEnabled.mockResolvedValue(true);
    mockListCatalogProducts.mockResolvedValue({ data: [FIXED_PRODUCT], page: 1, pageSize: 20, total: 1 });
    mockListCatalogCategories.mockResolvedValue(["Volantes"]);

    render(await CatalogoPage({ searchParams: Promise.resolve({}) }));

    expect(mockIsCatalogEnabled).toHaveBeenCalledWith(SESSION.businessId);
    expect(mockListCatalogProducts).toHaveBeenCalledWith(SESSION, {
      q: undefined,
      category: undefined,
      pricingMode: undefined,
      status: undefined,
      sortBy: "name",
      sortDir: "asc",
      page: 1,
      pageSize: 20,
    });
    expect(screen.getByText("Volante A5")).toBeInTheDocument();
    // "fixed" is the common case (most businesses only ever use a single
    // price) — badging every row with it is noise, so the list hides it.
    expect(screen.queryByText("Precio único")).not.toBeInTheDocument();
  });

  it("shows a variant-count summary (not a single price) for a 'package' mode product", async () => {
    mockRequireSessionOrRedirect.mockResolvedValue(SESSION);
    mockIsCatalogEnabled.mockResolvedValue(true);
    mockListCatalogProducts.mockResolvedValue({ data: [PACKAGE_PRODUCT], page: 1, pageSize: 20, total: 1 });
    mockListCatalogCategories.mockResolvedValue([]);

    render(await CatalogoPage({ searchParams: Promise.resolve({}) }));

    expect(screen.getByText("2 variantes")).toBeInTheDocument();
    expect(screen.getByText("Según variante")).toBeInTheDocument();
    // Non-"fixed" modes still carry their badge — only "fixed" is hidden.
    expect(screen.getByText("Por paquete")).toBeInTheDocument();
  });

  it("results in a 404 when the catalog feature is disabled for the session's business, and never fetches products", async () => {
    mockRequireSessionOrRedirect.mockResolvedValue(SESSION);
    mockIsCatalogEnabled.mockResolvedValue(false);

    await expect(CatalogoPage({ searchParams: Promise.resolve({}) })).rejects.toMatchObject({
      digest: "NEXT_HTTP_ERROR_FALLBACK;404",
    });

    expect(mockListCatalogProducts).not.toHaveBeenCalled();
    expect(mockListCatalogCategories).not.toHaveBeenCalled();
  });

  it("shows an empty state when there are no catalog products", async () => {
    mockRequireSessionOrRedirect.mockResolvedValue(SESSION);
    mockIsCatalogEnabled.mockResolvedValue(true);
    mockListCatalogProducts.mockResolvedValue({ data: [], page: 1, pageSize: 20, total: 0 });
    mockListCatalogCategories.mockResolvedValue([]);

    render(await CatalogoPage({ searchParams: Promise.resolve({}) }));

    expect(screen.getByText(/no se encontraron productos de catálogo/i)).toBeInTheDocument();
  });

  it("threads a whitelisted sort through, and falls back for an unknown column", async () => {
    mockRequireSessionOrRedirect.mockResolvedValue(SESSION);
    mockIsCatalogEnabled.mockResolvedValue(true);
    mockListCatalogProducts.mockResolvedValue({ data: [FIXED_PRODUCT], page: 1, pageSize: 20, total: 1 });
    mockListCatalogCategories.mockResolvedValue([]);

    render(await CatalogoPage({ searchParams: Promise.resolve({ sort: "price", dir: "desc" }) }));
    expect(mockListCatalogProducts).toHaveBeenCalledWith(
      SESSION,
      expect.objectContaining({ sortBy: "price", sortDir: "desc" }),
    );

    mockListCatalogProducts.mockClear();
    render(await CatalogoPage({ searchParams: Promise.resolve({ sort: "nope", dir: "desc" }) }));
    expect(mockListCatalogProducts).toHaveBeenCalledWith(
      SESSION,
      expect.objectContaining({ sortBy: "name", sortDir: "asc" }),
    );
  });

  it("keeps the live filters in the sort links, and re-declares sort/dir as hidden fields so filtering doesn't reset them", async () => {
    mockRequireSessionOrRedirect.mockResolvedValue(SESSION);
    mockIsCatalogEnabled.mockResolvedValue(true);
    mockListCatalogProducts.mockResolvedValue({ data: [FIXED_PRODUCT], page: 1, pageSize: 20, total: 1 });
    mockListCatalogCategories.mockResolvedValue([]);

    const { container } = render(
      await CatalogoPage({ searchParams: Promise.resolve({ q: "Volante", sort: "price", dir: "desc" }) }),
    );

    expect(screen.getByRole("link", { name: /^categoría/i })).toHaveAttribute(
      "href",
      "/catalogo?q=Volante&sort=category&dir=asc",
    );

    const sortHidden = container.querySelector('input[type="hidden"][name="sort"]');
    const dirHidden = container.querySelector('input[type="hidden"][name="dir"]');
    expect(sortHidden).toHaveAttribute("value", "price");
    expect(dirHidden).toHaveAttribute("value", "desc");
  });

  it("offers the 'Nuevo producto' quick action, which opens the create dialog", async () => {
    mockRequireSessionOrRedirect.mockResolvedValue(SESSION);
    mockIsCatalogEnabled.mockResolvedValue(true);
    mockListCatalogProducts.mockResolvedValue({ data: [], page: 1, pageSize: 20, total: 0 });
    mockListCatalogCategories.mockResolvedValue([]);

    render(await CatalogoPage({ searchParams: Promise.resolve({}) }));

    // A dialog trigger, not a link: there is no /catalogo/new route any more —
    // creating happens in a modal, like Inventario.
    const trigger = screen.getByRole("button", { name: /nuevo producto/i });
    expect(trigger).not.toHaveAttribute("href");
  });
});
