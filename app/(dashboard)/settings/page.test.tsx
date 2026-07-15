import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Business, Session } from "@/lib/services/ports";

const mockRequireSessionOrRedirect = vi.fn<() => Promise<Session>>();
const mockGetBusinessProfile = vi.fn<(session: Session) => Promise<Business>>();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

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

const WORKER_SESSION: Session = {
  ...SESSION,
  role: "worker",
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

describe("SettingsPage (Negocio, editable — Fase 5 Lane 2)", () => {
  beforeEach(() => {
    mockRequireSessionOrRedirect.mockReset();
    mockGetBusinessProfile.mockReset();
  });

  it("resolves the session first, then shows the read-only profile; clicking 'Editar' reveals the form pre-filled with that session's business profile for an admin", async () => {
    const user = userEvent.setup();
    mockRequireSessionOrRedirect.mockResolvedValue(SESSION);
    mockGetBusinessProfile.mockResolvedValue(BUSINESS);

    render(await SettingsPage());

    expect(mockGetBusinessProfile).toHaveBeenCalledWith(SESSION);
    // Read-only first: values shown, no inputs until "Editar".
    expect(screen.getByText(BUSINESS.name)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /editar/i }));

    expect(screen.getByLabelText(/nombre/i)).toHaveValue(BUSINESS.name);
    expect(screen.getByLabelText(/telefono/i)).toHaveValue(BUSINESS.phone);
    expect(screen.getByLabelText(/^email/i)).toHaveValue(BUSINESS.email);
    expect(screen.getByLabelText(/direccion/i)).toHaveValue(BUSINESS.address);
    expect(screen.getByLabelText(/moneda/i)).toHaveValue(BUSINESS.currency);
  });

  it("shows an admin a read-only profile with an 'Editar' button first (editing is deferred), and the form + Save only after clicking it", async () => {
    const user = userEvent.setup();
    mockRequireSessionOrRedirect.mockResolvedValue(SESSION);
    mockGetBusinessProfile.mockResolvedValue(BUSINESS);

    render(await SettingsPage());

    // Deferred: no form/Save until the admin opts into editing.
    expect(screen.getByRole("button", { name: /editar/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /guardar/i })).not.toBeInTheDocument();
    expect(screen.queryAllByRole("textbox").length).toBe(0);

    await user.click(screen.getByRole("button", { name: /editar/i }));

    expect(screen.getByRole("button", { name: /guardar/i })).toBeInTheDocument();
    expect(screen.getAllByRole("textbox").length).toBeGreaterThan(0);
  });

  it("renders a read-only profile with no inputs and no Save button for a worker session (no role gate was the security gap)", async () => {
    mockRequireSessionOrRedirect.mockResolvedValue(WORKER_SESSION);
    mockGetBusinessProfile.mockResolvedValue(BUSINESS);

    render(await SettingsPage());

    expect(screen.getByText(BUSINESS.name)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /guardar/i })).not.toBeInTheDocument();
    expect(screen.queryAllByRole("textbox").length).toBe(0);
  });

  it("redirects to /login instead of ever calling the business-service when there is no valid session (defense in depth)", async () => {
    mockRequireSessionOrRedirect.mockRejectedValue(
      Object.assign(new Error("NEXT_REDIRECT"), { digest: "NEXT_REDIRECT;replace;/login;307;" })
    );

    await expect(SettingsPage()).rejects.toMatchObject({ digest: expect.stringContaining("NEXT_REDIRECT") });
    expect(mockGetBusinessProfile).not.toHaveBeenCalled();
  });
});
