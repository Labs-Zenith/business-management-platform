import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { Business, Session } from "@/lib/services/ports";

const mockRequireSessionOrRedirect = vi.fn<() => Promise<Session>>();
const mockGetBusinessProfile = vi.fn<(session: Session) => Promise<Business>>();

vi.mock("@/lib/mock/cookie-persistence", () => ({
  loadStoreFromCookie: vi.fn().mockResolvedValue(undefined),
  saveStoreToCookie: vi.fn(),
}));

vi.mock("@/lib/session", () => ({
  requireSessionOrRedirect: () => mockRequireSessionOrRedirect(),
}));

vi.mock("@/lib/services/business-service", () => ({
  getBusinessProfile: (session: Session) => mockGetBusinessProfile(session),
}));

import SettingsPage from "./page";

const SESSION: Session = {
  userId: "20000000-0000-4000-8000-000000000001",
  businessId: "10000000-0000-4000-8000-000000000001",
  email: "demo@negociodemo.test",
  role: "admin",
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
    mockRequireSessionOrRedirect.mockReset();
    mockGetBusinessProfile.mockReset();
  });

  it("resolves the session first, then renders that session's business profile", async () => {
    mockRequireSessionOrRedirect.mockResolvedValue(SESSION);
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
    mockRequireSessionOrRedirect.mockResolvedValue(SESSION);
    mockGetBusinessProfile.mockResolvedValue(BUSINESS);

    render(await SettingsPage());

    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("redirects to /login instead of ever calling the business-service when there is no valid session (defense in depth)", async () => {
    mockRequireSessionOrRedirect.mockRejectedValue(
      Object.assign(new Error("NEXT_REDIRECT"), { digest: "NEXT_REDIRECT;replace;/login;307;" })
    );

    await expect(SettingsPage()).rejects.toMatchObject({ digest: expect.stringContaining("NEXT_REDIRECT") });
    expect(mockGetBusinessProfile).not.toHaveBeenCalled();
  });
});
