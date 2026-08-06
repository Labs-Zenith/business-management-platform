import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { Session } from "@/lib/services/ports";

const mockRequireSessionOrRedirect = vi.fn<() => Promise<Session>>();
const mockIsCatalogEnabled = vi.fn<(businessId: string) => Promise<boolean>>();
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
  listCatalogCategories: (session: Session) => mockListCatalogCategories(session),
}));

// The form is a heavy, separately-tested client component (lazy-loaded via
// `dynamic(..., {ssr:false})`) — stubbed here to its received props only,
// matching `ventas/page.test.tsx`'s convention for lazy/heavy children.
vi.mock("@/components/domain/catalogo/catalog-product-form", () => ({
  default: ({ categories }: { categories: string[] }) => (
    <div data-testid="catalog-product-form">{JSON.stringify(categories)}</div>
  ),
}));

import NewCatalogProductPage from "./page";

const SESSION: Session = {
  userId: "20000000-0000-4000-8000-000000000001",
  businessId: "10000000-0000-4000-8000-000000000001",
  email: "demo@negociodemo.test",
  role: "admin",
};

describe("NewCatalogProductPage", () => {
  beforeEach(() => {
    mockRequireSessionOrRedirect.mockReset();
    mockIsCatalogEnabled.mockReset();
    mockListCatalogCategories.mockReset();
  });

  it("renders the create form with the business's existing categories once the catalog feature is enabled", async () => {
    mockRequireSessionOrRedirect.mockResolvedValue(SESSION);
    mockIsCatalogEnabled.mockResolvedValue(true);
    mockListCatalogCategories.mockResolvedValue(["Volantes", "Stickers"]);

    render(await NewCatalogProductPage());

    expect(mockIsCatalogEnabled).toHaveBeenCalledWith(SESSION.businessId);
    expect(screen.getByTestId("catalog-product-form")).toHaveTextContent(JSON.stringify(["Volantes", "Stickers"]));
    expect(screen.getByText("Nuevo producto de catálogo")).toBeInTheDocument();
  });

  it("results in a 404 when the catalog feature is disabled, and never fetches categories", async () => {
    mockRequireSessionOrRedirect.mockResolvedValue(SESSION);
    mockIsCatalogEnabled.mockResolvedValue(false);

    await expect(NewCatalogProductPage()).rejects.toMatchObject({ digest: "NEXT_HTTP_ERROR_FALLBACK;404" });
    expect(mockListCatalogCategories).not.toHaveBeenCalled();
  });
});
