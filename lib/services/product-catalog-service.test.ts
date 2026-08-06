import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/server/api-error";
import type {
  CatalogProductCreate,
  CatalogProductDeleteResult,
  CatalogProductDetail,
  CatalogProductListQuery,
  CatalogProductSummary,
  CatalogProductUpdate,
  Paged,
  Session,
} from "@/lib/services/ports";

const mockList = vi.fn<(businessId: string, query: CatalogProductListQuery) => Promise<Paged<CatalogProductSummary>>>();
const mockGetById = vi.fn<(businessId: string, id: string) => Promise<CatalogProductDetail | null>>();
const mockCreate = vi.fn<(businessId: string, data: CatalogProductCreate) => Promise<CatalogProductDetail>>();
const mockUpdate = vi.fn<
  (businessId: string, id: string, data: CatalogProductUpdate) => Promise<CatalogProductDetail | null>
>();
const mockListCategories = vi.fn<(businessId: string) => Promise<string[]>>();
const mockDelete = vi.fn<(businessId: string, id: string) => Promise<CatalogProductDeleteResult>>();

vi.mock("@/lib/services/repositories", () => ({
  repositories: {
    productCatalog: {
      list: (businessId: string, query: CatalogProductListQuery) => mockList(businessId, query),
      getById: (businessId: string, id: string) => mockGetById(businessId, id),
      create: (businessId: string, data: CatalogProductCreate) => mockCreate(businessId, data),
      update: (businessId: string, id: string, data: CatalogProductUpdate) => mockUpdate(businessId, id, data),
      listCategories: (businessId: string) => mockListCategories(businessId),
      delete: (businessId: string, id: string) => mockDelete(businessId, id),
    },
  },
}));

import {
  createCatalogProduct,
  deleteCatalogProduct,
  getCatalogProduct,
  listCatalogCategories,
  listCatalogProducts,
  updateCatalogProduct,
  validateCatalogProductPayload,
} from "./product-catalog-service";

const SESSION: Session = {
  userId: "20000000-0000-4000-8000-000000000001",
  businessId: "10000000-0000-4000-8000-000000000001",
  email: "demo@negociodemo.test",
  role: "admin",
};

const OTHER_BUSINESS_ID = "10000000-0000-4000-8000-000000000099";

function buildDetail(overrides: Partial<CatalogProductDetail> = {}): CatalogProductDetail {
  return {
    id: "70000000-0000-4000-8000-000000000001",
    businessId: SESSION.businessId,
    name: "Volante A5",
    category: "Impresos",
    description: null,
    pricingMode: "fixed",
    minOrderQuantity: 1,
    fixedUnitPrice: 1500,
    areaBasePrice: null,
    areaRatePerM2: null,
    areaMinPrice: null,
    active: true,
    createdAt: "2024-01-01T00:00:00.000Z",
    updatedAt: "2024-01-01T00:00:00.000Z",
    variants: [],
    ...overrides,
  };
}

beforeEach(() => {
  mockList.mockReset();
  mockGetById.mockReset();
  mockCreate.mockReset();
  mockUpdate.mockReset();
  mockListCategories.mockReset();
  mockDelete.mockReset();
});

describe("listCatalogProducts", () => {
  it("always scopes the list to session.businessId, never a client-supplied id", async () => {
    const query: CatalogProductListQuery = { page: 1, pageSize: 20 };
    mockList.mockResolvedValue({ data: [], page: 1, pageSize: 20, total: 0 });

    await listCatalogProducts(SESSION, query);

    expect(mockList).toHaveBeenCalledWith(SESSION.businessId, query);
    expect(mockList).not.toHaveBeenCalledWith(OTHER_BUSINESS_ID, query);
  });
});

describe("getCatalogProduct", () => {
  it("returns the product scoped to the session's business", async () => {
    const detail = buildDetail();
    mockGetById.mockResolvedValue(detail);

    const result = await getCatalogProduct(SESSION, detail.id);

    expect(mockGetById).toHaveBeenCalledWith(SESSION.businessId, detail.id);
    expect(result).toEqual(detail);
  });

  it("throws NOT_FOUND when the repo resolves null (missing or cross-business)", async () => {
    mockGetById.mockResolvedValue(null);

    await expect(getCatalogProduct(SESSION, "cross-business-id")).rejects.toMatchObject({
      code: "NOT_FOUND",
      status: 404,
    });
  });
});

describe("listCatalogCategories", () => {
  it("always scopes to session.businessId", async () => {
    mockListCategories.mockResolvedValue(["Avisos", "Stickers"]);

    const result = await listCatalogCategories(SESSION);

    expect(mockListCategories).toHaveBeenCalledWith(SESSION.businessId);
    expect(result).toEqual(["Avisos", "Stickers"]);
  });
});

describe("validateCatalogProductPayload", () => {
  it("passes for a valid fixed-mode payload", () => {
    expect(() =>
      validateCatalogProductPayload({ pricingMode: "fixed", fixedUnitPrice: 1500 }),
    ).not.toThrow();
  });

  it("throws ApiError VALIDATION_ERROR when fixed mode is missing fixedUnitPrice", () => {
    expect(() => validateCatalogProductPayload({ pricingMode: "fixed" })).toThrow(ApiError);
    try {
      validateCatalogProductPayload({ pricingMode: "fixed" });
    } catch (error) {
      expect((error as ApiError).code).toBe("VALIDATION_ERROR");
    }
  });

  it("throws when area mode is missing areaRatePerM2", () => {
    expect(() =>
      validateCatalogProductPayload({ pricingMode: "area", areaBasePrice: 100 }),
    ).toThrow(ApiError);
  });

  it("throws when variant mode has zero variants", () => {
    expect(() => validateCatalogProductPayload({ pricingMode: "variant", variants: [] })).toThrow(ApiError);
  });

  it("throws when a package variant is missing packageTotalPrice", () => {
    expect(() =>
      validateCatalogProductPayload({
        pricingMode: "package",
        variants: [{ name: "Paquete", packageQuantity: 10 }],
      }),
    ).toThrow(ApiError);
  });

  it("throws when a tiered variant has duplicate tier quantities", () => {
    expect(() =>
      validateCatalogProductPayload({
        pricingMode: "tiered",
        variants: [
          {
            name: "Estándar",
            tiers: [
              { quantity: 12, unitPrice: 100 },
              { quantity: 12, unitPrice: 90 },
            ],
          },
        ],
      }),
    ).toThrow(ApiError);
  });

  it("passes for a valid tiered-mode payload", () => {
    expect(() =>
      validateCatalogProductPayload({
        pricingMode: "tiered",
        variants: [{ name: "Estándar", tiers: [{ quantity: 12, unitPrice: 100 }] }],
      }),
    ).not.toThrow();
  });
});

describe("createCatalogProduct", () => {
  it("validates the payload before calling the repository, and persists under session.businessId", async () => {
    const created = buildDetail();
    mockCreate.mockResolvedValue(created);

    const data: CatalogProductCreate = { name: "Volante A5", pricingMode: "fixed", fixedUnitPrice: 1500 };
    const result = await createCatalogProduct(SESSION, data);

    expect(mockCreate).toHaveBeenCalledWith(SESSION.businessId, data);
    expect(result).toEqual(created);
  });

  it("rejects an invalid payload with VALIDATION_ERROR before ever calling the repository", async () => {
    const invalid = { name: "Volante A5", pricingMode: "fixed" } as unknown as CatalogProductCreate;

    await expect(createCatalogProduct(SESSION, invalid)).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect(mockCreate).not.toHaveBeenCalled();
  });
});

describe("updateCatalogProduct", () => {
  it("re-validates a full replacement payload (pricingMode present) before calling the repository", async () => {
    const invalid = { pricingMode: "fixed" } as unknown as CatalogProductUpdate;

    await expect(updateCatalogProduct(SESSION, "some-id", invalid)).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
    });
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("skips mode-invariant validation for a bare { active } toggle and calls the repository directly", async () => {
    const updated = buildDetail({ active: false });
    mockUpdate.mockResolvedValue(updated);

    const result = await updateCatalogProduct(SESSION, updated.id, { active: false });

    expect(mockUpdate).toHaveBeenCalledWith(SESSION.businessId, updated.id, { active: false });
    expect(result).toEqual(updated);
  });

  it("throws NOT_FOUND when the repository resolves null (missing or cross-business)", async () => {
    mockUpdate.mockResolvedValue(null);

    await expect(updateCatalogProduct(SESSION, "missing-id", { active: true })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });
});

describe("deleteCatalogProduct", () => {
  it("always scopes the delete to session.businessId, never a client-supplied id", async () => {
    mockDelete.mockResolvedValue({ outcome: "deleted" });

    await deleteCatalogProduct(SESSION, "some-id");

    expect(mockDelete).toHaveBeenCalledWith(SESSION.businessId, "some-id");
  });

  it("resolves (no throw) when the repository reports deleted", async () => {
    mockDelete.mockResolvedValue({ outcome: "deleted" });

    await expect(deleteCatalogProduct(SESSION, "some-id")).resolves.toBeUndefined();
  });

  it("throws NOT_FOUND when the repository resolves not_found (missing or cross-business)", async () => {
    mockDelete.mockResolvedValue({ outcome: "not_found" });

    await expect(deleteCatalogProduct(SESSION, "missing-id")).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  /**
   * The CONFLICT message is rendered verbatim in the confirm dialog's inline
   * alert and is followed by a real "Desactivar" button, so its exact
   * wording (including singular/plural) is part of the contract — same as
   * `deleteProduct`'s (`lib/services/product-service.test.ts`).
   */
  it("throws CONFLICT naming the invoice count once the product has been sold", async () => {
    mockDelete.mockResolvedValue({ outcome: "conflict", invoiceCount: 1 });

    await expect(deleteCatalogProduct(SESSION, "some-id")).rejects.toMatchObject({
      code: "CONFLICT",
      status: 409,
      message: "No se puede eliminar este producto porque tiene 1 factura asociada. Desactívalo en su lugar.",
      details: { invoiceCount: 1 },
    });
  });

  it("uses the plural form for several invoices", async () => {
    mockDelete.mockResolvedValue({ outcome: "conflict", invoiceCount: 2 });

    await expect(deleteCatalogProduct(SESSION, "some-id")).rejects.toMatchObject({
      message: "No se puede eliminar este producto porque tiene 2 facturas asociadas. Desactívalo en su lugar.",
    });
  });
});
