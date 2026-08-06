import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { CatalogProductDetail, Session } from "@/lib/services/ports";

const mockRequireSessionOrRedirect = vi.fn<() => Promise<Session>>();
const mockIsCatalogEnabled = vi.fn<(businessId: string) => Promise<boolean>>();
const mockGetCatalogProduct = vi.fn<(session: Session, id: string) => Promise<CatalogProductDetail>>();

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
  getCatalogProduct: (session: Session, id: string) => mockGetCatalogProduct(session, id),
}));

import CatalogProductDetailPage from "./page";

const SESSION: Session = {
  userId: "20000000-0000-4000-8000-000000000001",
  businessId: "10000000-0000-4000-8000-000000000001",
  email: "demo@negociodemo.test",
  role: "admin",
};

const BASE: CatalogProductDetail = {
  id: "90000000-0000-4000-8000-000000000001",
  businessId: SESSION.businessId,
  name: "Volante A5",
  category: "Volantes",
  description: "Impresión full color",
  pricingMode: "fixed",
  minOrderQuantity: 50,
  fixedUnitPrice: 500_00,
  areaBasePrice: null,
  areaRatePerM2: null,
  areaMinPrice: null,
  active: true,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  variants: [],
};

describe("CatalogProductDetailPage", () => {
  beforeEach(() => {
    mockRequireSessionOrRedirect.mockReset();
    mockIsCatalogEnabled.mockReset();
    mockGetCatalogProduct.mockReset();
  });

  it("renders a 'fixed' mode product's price and minimum order as StatCards", async () => {
    mockRequireSessionOrRedirect.mockResolvedValue(SESSION);
    mockIsCatalogEnabled.mockResolvedValue(true);
    mockGetCatalogProduct.mockResolvedValue(BASE);

    render(await CatalogProductDetailPage({ params: Promise.resolve({ id: BASE.id }) }));

    expect(mockGetCatalogProduct).toHaveBeenCalledWith(SESSION, BASE.id);
    expect(screen.getByRole("heading", { name: "Volante A5" })).toBeInTheDocument();
    expect(screen.getByText("$ 500")).toBeInTheDocument();
    expect(screen.getByText("50 unidades")).toBeInTheDocument();
    expect(screen.getByText("Sin opciones")).toBeInTheDocument();
  });

  it("does not render the pricing-mode badge for a 'fixed' mode product", async () => {
    mockRequireSessionOrRedirect.mockResolvedValue(SESSION);
    mockIsCatalogEnabled.mockResolvedValue(true);
    mockGetCatalogProduct.mockResolvedValue(BASE);

    render(await CatalogProductDetailPage({ params: Promise.resolve({ id: BASE.id }) }));

    expect(screen.queryByText("Precio único")).not.toBeInTheDocument();
  });

  it("renders the pricing-mode badge for a non-'fixed' mode product", async () => {
    mockRequireSessionOrRedirect.mockResolvedValue(SESSION);
    mockIsCatalogEnabled.mockResolvedValue(true);
    mockGetCatalogProduct.mockResolvedValue({
      ...BASE,
      pricingMode: "area",
      fixedUnitPrice: null,
      areaBasePrice: 10_000_00,
      areaRatePerM2: 80_000_00,
      areaMinPrice: null,
    });

    render(await CatalogProductDetailPage({ params: Promise.resolve({ id: BASE.id }) }));

    expect(screen.getByText("Por medida")).toBeInTheDocument();
  });

  it("renders an 'area' mode product's base + per-m² rate", async () => {
    mockRequireSessionOrRedirect.mockResolvedValue(SESSION);
    mockIsCatalogEnabled.mockResolvedValue(true);
    mockGetCatalogProduct.mockResolvedValue({
      ...BASE,
      pricingMode: "area",
      fixedUnitPrice: null,
      areaBasePrice: 10_000_00,
      areaRatePerM2: 80_000_00,
      areaMinPrice: null,
    });

    render(await CatalogProductDetailPage({ params: Promise.resolve({ id: BASE.id }) }));

    expect(screen.getByText(/\$ 10\.000 \+ \$ 80\.000\/m²/)).toBeInTheDocument();
  });

  it("renders a 'variant' mode product's variants table with a per-row unit price", async () => {
    mockRequireSessionOrRedirect.mockResolvedValue(SESSION);
    mockIsCatalogEnabled.mockResolvedValue(true);
    mockGetCatalogProduct.mockResolvedValue({
      ...BASE,
      pricingMode: "variant",
      fixedUnitPrice: null,
      variants: [
        {
          id: "v1",
          productId: BASE.id,
          name: "150x55 cm",
          description: null,
          sortOrder: 0,
          unitPrice: 120_000_00,
          packageQuantity: null,
          packageTotalPrice: null,
          active: true,
          tiers: [],
          minOrderQuantity: null,
        },
      ],
    });

    render(await CatalogProductDetailPage({ params: Promise.resolve({ id: BASE.id }) }));

    expect(screen.getByText("150x55 cm")).toBeInTheDocument();
    // "$ 120.000" appears twice: once as the "Rango de precio" StatCard's
    // value, once as the variants table's own price cell (both derive from
    // the same single-variant price, so they coincide) — matches
    // `invoices/page.test.tsx`'s "getAllByText(...).length" convention for
    // legitimately-repeated text.
    expect(screen.getAllByText("$ 120.000").length).toBeGreaterThan(0);
  });

  it("renders a 'package' mode product's per-package price and derived per-unit approximation", async () => {
    mockRequireSessionOrRedirect.mockResolvedValue(SESSION);
    mockIsCatalogEnabled.mockResolvedValue(true);
    mockGetCatalogProduct.mockResolvedValue({
      ...BASE,
      pricingMode: "package",
      fixedUnitPrice: null,
      variants: [
        {
          id: "v1",
          productId: BASE.id,
          name: "Paquete de 750",
          description: null,
          sortOrder: 0,
          unitPrice: null,
          packageQuantity: 750,
          packageTotalPrice: 60_000_00,
          active: true,
          tiers: [],
          minOrderQuantity: null,
        },
      ],
    });

    render(await CatalogProductDetailPage({ params: Promise.resolve({ id: BASE.id }) }));

    expect(screen.getByText("Paquete de 750")).toBeInTheDocument();
    expect(screen.getByText("750 unidades (1 paquete)")).toBeInTheDocument();
    // "$ 60.000" appears twice (StatCard range + table cell) — see the
    // 'variant' mode test above for why.
    expect(screen.getAllByText("$ 60.000").length).toBeGreaterThan(0);
    // 60,000 pesos / 750 units = 80 pesos/unit, shown only in the table.
    expect(screen.getByText("$ 80")).toBeInTheDocument();
  });

  it("renders a 'tiered' mode product as one Card per variant, each with its own quantity ladder", async () => {
    mockRequireSessionOrRedirect.mockResolvedValue(SESSION);
    mockIsCatalogEnabled.mockResolvedValue(true);
    mockGetCatalogProduct.mockResolvedValue({
      ...BASE,
      pricingMode: "tiered",
      fixedUnitPrice: null,
      variants: [
        {
          id: "v1",
          productId: BASE.id,
          name: "Agenda ejecutiva",
          description: null,
          sortOrder: 0,
          unitPrice: null,
          packageQuantity: null,
          packageTotalPrice: null,
          active: true,
          minOrderQuantity: 12,
          tiers: [
            { id: "t1", variantId: "v1", quantity: 12, unitPrice: 20_000_00, flatTotalPrice: null, sortOrder: 0 },
            { id: "t2", variantId: "v1", quantity: 24, unitPrice: 16_000_00, flatTotalPrice: null, sortOrder: 1 },
          ],
        },
      ],
    });

    render(await CatalogProductDetailPage({ params: Promise.resolve({ id: BASE.id }) }));

    expect(screen.getByText("Agenda ejecutiva")).toBeInTheDocument();
    expect(screen.getByText("12")).toBeInTheDocument();
    expect(screen.getByText("24")).toBeInTheDocument();
    expect(screen.getByText("12 unidades")).toBeInTheDocument();
  });

  it("results in a 404 when the catalog feature is disabled, and never fetches the product", async () => {
    mockRequireSessionOrRedirect.mockResolvedValue(SESSION);
    mockIsCatalogEnabled.mockResolvedValue(false);

    await expect(CatalogProductDetailPage({ params: Promise.resolve({ id: BASE.id }) })).rejects.toMatchObject({
      digest: "NEXT_HTTP_ERROR_FALLBACK;404",
    });
    expect(mockGetCatalogProduct).not.toHaveBeenCalled();
  });

  it("links 'Editar producto' to /catalogo/{id}/edit", async () => {
    mockRequireSessionOrRedirect.mockResolvedValue(SESSION);
    mockIsCatalogEnabled.mockResolvedValue(true);
    mockGetCatalogProduct.mockResolvedValue(BASE);

    render(await CatalogProductDetailPage({ params: Promise.resolve({ id: BASE.id }) }));

    expect(screen.getByRole("button", { name: /editar producto/i })).toHaveAttribute(
      "href",
      `/catalogo/${BASE.id}/edit`,
    );
  });
});
