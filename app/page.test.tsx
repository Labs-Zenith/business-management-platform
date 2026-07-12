import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Session } from "@/lib/services/ports";

const mockGetSession = vi.fn<() => Promise<Session | null>>();
const mockRedirect = vi.fn();

vi.mock("@/lib/session", () => ({
  getSession: () => mockGetSession(),
}));

vi.mock("next/navigation", () => ({
  redirect: (url: string) => mockRedirect(url),
}));

import Home from "./page";

const SESSION: Session = {
  userId: "20000000-0000-4000-8000-000000000001",
  businessId: "10000000-0000-4000-8000-000000000001",
  email: "demo@negociodemo.test",
  role: "admin",
};

describe("Home page (root route)", () => {
  beforeEach(() => {
    mockGetSession.mockReset();
    mockRedirect.mockReset();
  });

  it("redirects to /dashboard when a session exists", async () => {
    mockGetSession.mockResolvedValue(SESSION);

    await Home();

    expect(mockRedirect).toHaveBeenCalledWith("/dashboard");
  });

  it("redirects to /login when no session exists", async () => {
    mockGetSession.mockResolvedValue(null);

    await Home();

    expect(mockRedirect).toHaveBeenCalledWith("/login");
  });
});
