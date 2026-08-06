import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { CatalogProductDetail, Session } from "@/lib/services/ports";

const mockRequireSessionOrRedirect = vi.fn<() => Promise<Session>>();
const mockIsCatalogEnabled = vi.fn<(businessId: string) => Promise<boolean>>();
const mockGetCatalogProduct = vi.fn<(session: Session, id: string) => Promise<CatalogProductDetail>>();
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
  getCatalogProduct: (session: Session, id: string) => mockGetCatalogProduct(session, id),
  listCatalogCategories: (session: Session) => mockListCatalogCategories(session),
}));

// Heavy, separately-tested client form — stubbed to its received props only,
// matching `new/page.test.tsx`'s convention.
vi.mock("@/components/domain/catalogo/catalog-product-form", () => ({
  default: ({ categories, product }: { categories: string[]; product?: { id: string; name: string } }) => (
    <div data-testid="catalog-product-form">
      <div data-testid="form-categories">{JSON.stringify(categories)}</div>
      <div data-testid="form-product">{JSON.stringify(product)}</div>
    </div>
  ),
}));

import EditCatalogProductPage from "./page";

const SESSION: Session = {
  userId: "20000000-0000-4000-8000-000000000001",
  businessId: "10000000-0000-4000-8000-000000000001",
  email: "demo@negociodemo.test",
  role: "admin",
};

const PRODUCT: CatalogProductDetail = {
  id: "90000000-0000-4000-8000-000000000001",
  businessId: SESSION.businessId,
  name: "Volante A5",
  category: "Volantes",
  description: null,
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

describe("EditCatalogProductPage", () => {
  beforeEach(() => {
    mockRequireSessionOrRedirect.mockReset();
    mockIsCatalogEnabled.mockReset();
    mockGetCatalogProduct.mockReset();
    mockListCatalogCategories.mockReset();
  });

  it("fetches the product and categories, then hands a mapped 'product' prop (id, pricingMode, variants, ...) to the form", async () => {
    mockRequireSessionOrRedirect.mockResolvedValue(SESSION);
    mockIsCatalogEnabled.mockResolvedValue(true);
    mockGetCatalogProduct.mockResolvedValue(PRODUCT);
    mockListCatalogCategories.mockResolvedValue(["Volantes"]);

    render(await EditCatalogProductPage({ params: Promise.resolve({ id: PRODUCT.id }) }));

    expect(mockGetCatalogProduct).toHaveBeenCalledWith(SESSION, PRODUCT.id);
    expect(screen.getByTestId("form-categories")).toHaveTextContent(JSON.stringify(["Volantes"]));
    const productProp = JSON.parse(screen.getByTestId("form-product").textContent ?? "null");
    expect(productProp).toMatchObject({
      id: PRODUCT.id,
      name: "Volante A5",
      pricingMode: "fixed",
      fixedUnitPrice: 500_00,
      active: true,
      variants: [],
    });
    expect(screen.getByText("Editar producto de catálogo")).toBeInTheDocument();
  });

  it("results in a 404 when the catalog feature is disabled, and never fetches the product", async () => {
    mockRequireSessionOrRedirect.mockResolvedValue(SESSION);
    mockIsCatalogEnabled.mockResolvedValue(false);

    await expect(EditCatalogProductPage({ params: Promise.resolve({ id: PRODUCT.id }) })).rejects.toMatchObject({
      digest: "NEXT_HTTP_ERROR_FALLBACK;404",
    });
    expect(mockGetCatalogProduct).not.toHaveBeenCalled();
  });
});
