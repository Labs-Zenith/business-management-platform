import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/server/api-error";
import type { Business, BusinessUpdate, Session } from "@/lib/services/ports";

const mockGetById = vi.fn<(businessId: string) => Promise<Business | null>>();
const mockUpdate = vi.fn<(businessId: string, data: BusinessUpdate) => Promise<Business | null>>();

vi.mock("@/lib/services/repositories", () => ({
  repositories: {
    business: {
      getById: (businessId: string) => mockGetById(businessId),
      update: (businessId: string, data: BusinessUpdate) => mockUpdate(businessId, data),
    },
  },
}));

import { getBusinessProfile, updateBusinessProfile } from "./business-service";

const SESSION: Session = {
  userId: "20000000-0000-4000-8000-000000000001",
  businessId: "10000000-0000-4000-8000-000000000001",
  email: "demo@negociodemo.test",
  role: "admin",
};

const WORKER_SESSION: Session = {
  ...SESSION,
  role: "worker",
};

const OTHER_BUSINESS_ID = "10000000-0000-4000-8000-000000000099";

const BUSINESS: Business = {
  id: SESSION.businessId,
  name: "Negocio Demo",
  email: "contacto@negociodemo.test",
  phone: "3000000000",
  address: "Calle 10 # 20-30, Bogota",
  currency: "COP",
  createdAt: "2024-01-01T00:00:00.000Z",
  updatedAt: "2024-01-01T00:00:00.000Z",
};

describe("getBusinessProfile", () => {
  beforeEach(() => {
    mockGetById.mockReset();
  });

  it("returns the business record scoped to session.businessId", async () => {
    mockGetById.mockResolvedValue(BUSINESS);

    const result = await getBusinessProfile(SESSION);

    expect(mockGetById).toHaveBeenCalledTimes(1);
    expect(mockGetById).toHaveBeenCalledWith(SESSION.businessId);
    expect(mockGetById).not.toHaveBeenCalledWith(OTHER_BUSINESS_ID);
    expect(result).toEqual(BUSINESS);
  });

  it("throws NOT_FOUND if no business record matches the session's businessId (defensive — should never happen with a valid session)", async () => {
    mockGetById.mockResolvedValue(null);

    await expect(getBusinessProfile(SESSION)).rejects.toBeInstanceOf(ApiError);
    await expect(getBusinessProfile(SESSION)).rejects.toMatchObject({
      code: "NOT_FOUND",
      status: 404,
    });
  });
});

describe("updateBusinessProfile", () => {
  beforeEach(() => {
    mockUpdate.mockReset();
  });

  it("throws FORBIDDEN for a worker session (lacks editBusinessProfile) and never touches the repository", async () => {
    await expect(updateBusinessProfile(WORKER_SESSION, { name: "Nombre Hackeado" })).rejects.toBeInstanceOf(ApiError);
    await expect(updateBusinessProfile(WORKER_SESSION, { name: "Nombre Hackeado" })).rejects.toMatchObject({
      code: "FORBIDDEN",
      status: 403,
    });
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("succeeds for an admin session", async () => {
    const updatedBusiness: Business = { ...BUSINESS, name: "Negocio Renombrado" };
    mockUpdate.mockResolvedValue(updatedBusiness);

    const result = await updateBusinessProfile(SESSION, { name: "Negocio Renombrado" });

    expect(result).toEqual(updatedBusiness);
  });

  it("forwards session.businessId (never a client-supplied id) and the update data to the repository", async () => {
    const updatedBusiness: Business = { ...BUSINESS, name: "Negocio Renombrado" };
    mockUpdate.mockResolvedValue(updatedBusiness);

    const result = await updateBusinessProfile(SESSION, { name: "Negocio Renombrado" });

    expect(mockUpdate).toHaveBeenCalledTimes(1);
    expect(mockUpdate).toHaveBeenCalledWith(SESSION.businessId, { name: "Negocio Renombrado" });
    expect(mockUpdate).not.toHaveBeenCalledWith(OTHER_BUSINESS_ID, expect.anything());
    expect(result).toEqual(updatedBusiness);
  });

  it("forwards a currency-only update untouched", async () => {
    const updatedBusiness: Business = { ...BUSINESS, currency: "USD" };
    mockUpdate.mockResolvedValue(updatedBusiness);

    const result = await updateBusinessProfile(SESSION, { currency: "USD" });

    expect(mockUpdate).toHaveBeenCalledWith(SESSION.businessId, { currency: "USD" });
    expect(result.currency).toBe("USD");
  });

  it("throws NOT_FOUND if the repository returns null (defensive — should never happen with a valid session)", async () => {
    mockUpdate.mockResolvedValue(null);

    await expect(updateBusinessProfile(SESSION, { name: "No existe" })).rejects.toBeInstanceOf(ApiError);
    await expect(updateBusinessProfile(SESSION, { name: "No existe" })).rejects.toMatchObject({
      code: "NOT_FOUND",
      status: 404,
    });
  });
});
