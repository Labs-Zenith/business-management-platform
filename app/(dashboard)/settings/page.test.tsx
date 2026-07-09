import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ApiError } from "@/lib/server/api-error";
import type { Business, Session } from "@/lib/services/ports";

const mockRequireSession = vi.fn<() => Promise<Session>>();
const mockGetBusinessProfile = vi.fn<(session: Session) => Promise<Business>>();

vi.mock("@/lib/mock/cookie-persistence", () => ({
  loadStoreFromCookie: vi.fn().mockResolvedValue(undefined),
  saveStoreToCookie: vi.fn(),
}));

vi.mock("@/lib/session", () => ({
  requireSession: () => mockRequireSession(),
}));

vi.mock("@/lib/services/business-service", () => ({
  getBusinessProfile: (session: Session) => mockGetBusinessProfile(session),
}));

import SettingsPage from "./page";

const SESSION: Session = {
  userId: "20000000-0000-4000-8000-000000000001",
  businessId: "10000000-0000-4000-8000-000000000001",
  email: "demo@negociodemo.test",
};

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

describe("SettingsPage (Negocio, read-only)", () => {
  beforeEach(() => {
    mockRequireSession.mockReset();
    mockGetBusinessProfile.mockReset();
  });

  it("resolves the session first, then renders that session's business profile", async () => {
    mockRequireSession.mockResolvedValue(SESSION);
    mockGetBusinessProfile.mockResolvedValue(BUSINESS);

    render(await SettingsPage());

    expect(mockGetBusinessProfile).toHaveBeenCalledWith(SESSION);
    expect(screen.getByText(BUSINESS.name)).toBeInTheDocument();
    expect(screen.getByText(BUSINESS.phone!)).toBeInTheDocument();
    expect(screen.getByText(BUSINESS.email!)).toBeInTheDocument();
    expect(screen.getByText(BUSINESS.address!)).toBeInTheDocument();
    expect(screen.getByText(BUSINESS.currency)).toBeInTheDocument();
  });

  it("renders no edit affordance (buttons/inputs) — display-only per the business-profile spec", async () => {
    mockRequireSession.mockResolvedValue(SESSION);
    mockGetBusinessProfile.mockResolvedValue(BUSINESS);

    render(await SettingsPage());

    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("propagates requireSession's UNAUTHENTICATED rejection instead of ever calling the business-service (defense in depth)", async () => {
    mockRequireSession.mockRejectedValue(new ApiError("UNAUTHENTICATED", "Authentication required."));

    await expect(SettingsPage()).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
    expect(mockGetBusinessProfile).not.toHaveBeenCalled();
  });
});
