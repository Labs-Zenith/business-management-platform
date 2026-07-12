import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/server/api-error";
import type { Business, Session } from "@/lib/services/ports";

const mockGetById = vi.fn<(businessId: string) => Promise<Business | null>>();

vi.mock("@/lib/services/repositories", () => ({
  repositories: {
    business: {
      getById: (businessId: string) => mockGetById(businessId),
    },
  },
}));

import { getBusinessProfile } from "./business-service";

const SESSION: Session = {
  userId: "20000000-0000-4000-8000-000000000001",
  businessId: "10000000-0000-4000-8000-000000000001",
  email: "demo@negociodemo.test",
  role: "admin",
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
