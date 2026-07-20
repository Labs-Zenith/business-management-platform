import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { SavedAccount, Session } from "@/lib/services/ports";

const mockGetSession = vi.fn<() => Promise<Session | null>>();
const mockGetSavedAccounts = vi.fn<() => Promise<SavedAccount[]>>();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/lib/mock/cookie-persistence", () => ({
  loadStoreFromCookie: vi.fn().mockResolvedValue(undefined),
  saveStoreToCookie: vi.fn(),
}));

vi.mock("@/lib/session", () => ({
  getSession: () => mockGetSession(),
  getSavedAccounts: () => mockGetSavedAccounts(),
}));

import LoginPage from "./page";

const SESSION: Session = {
  userId: "20000000-0000-4000-8000-000000000001",
  businessId: "10000000-0000-4000-8000-000000000001",
  email: "demo@negociodemo.test",
  role: "admin",
};

const SAVED_ACCOUNT: SavedAccount = {
  userId: SESSION.userId,
  email: SESSION.email,
  label: "Demo",
  active: true,
};

describe("LoginPage (server gate)", () => {
  beforeEach(() => {
    mockGetSession.mockReset();
    mockGetSavedAccounts.mockReset();
    mockGetSession.mockResolvedValue(SESSION);
  });

  it("renders the profile picker when saved accounts exist and ?add is absent", async () => {
    mockGetSavedAccounts.mockResolvedValue([SAVED_ACCOUNT]);

    render(await LoginPage({ searchParams: Promise.resolve({}) }));

    expect(screen.getByText("Elige un perfil")).toBeInTheDocument();
    expect(screen.getByText("Demo")).toBeInTheDocument();
  });

  it("renders the login form when there are no saved accounts", async () => {
    mockGetSavedAccounts.mockResolvedValue([]);

    render(await LoginPage({ searchParams: Promise.resolve({}) }));

    expect(screen.getByLabelText(/usuario/i)).toBeInTheDocument();
    expect(screen.queryByText("Elige un perfil")).not.toBeInTheDocument();
  });

  it("renders the login form when ?add=1 is present, even with saved accounts", async () => {
    mockGetSavedAccounts.mockResolvedValue([SAVED_ACCOUNT]);

    render(await LoginPage({ searchParams: Promise.resolve({ add: "1" }) }));

    expect(screen.getByLabelText(/usuario/i)).toBeInTheDocument();
    expect(screen.queryByText("Elige un perfil")).not.toBeInTheDocument();
  });
});
