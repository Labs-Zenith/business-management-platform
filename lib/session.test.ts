import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/server/api-error";
import type { Session } from "@/lib/services/ports";

const mockGetSession = vi.fn<() => Promise<Session | null>>();
const mockRedirect = vi.fn();

vi.mock("@/lib/services/repositories", () => ({
  repositories: {
    auth: {
      getSession: () => mockGetSession(),
      signIn: vi.fn(),
      signOut: vi.fn(),
    },
  },
}));

vi.mock("next/navigation", () => ({
  redirect: (url: string) => mockRedirect(url),
}));

import { getSession, requireSession, requireSessionOrRedirect } from "./session";

const VALID_SESSION: Session = {
  userId: "20000000-0000-4000-8000-000000000001",
  businessId: "10000000-0000-4000-8000-000000000001",
  email: "demo@negociodemo.test",
  role: "admin",
};

describe("getSession", () => {
  beforeEach(() => {
    mockGetSession.mockReset();
  });

  it("returns null (not throw) when no valid session cookie is present", async () => {
    mockGetSession.mockResolvedValue(null);

    await expect(getSession()).resolves.toBeNull();
  });

  it("returns the Session shape ({userId, businessId, email}) when a valid cookie exists", async () => {
    mockGetSession.mockResolvedValue(VALID_SESSION);

    await expect(getSession()).resolves.toEqual(VALID_SESSION);
  });
});

describe("requireSession", () => {
  beforeEach(() => {
    mockGetSession.mockReset();
  });

  it("throws an UNAUTHENTICATED ApiError when no valid session cookie is present", async () => {
    mockGetSession.mockResolvedValue(null);

    await expect(requireSession()).rejects.toBeInstanceOf(ApiError);
    await expect(requireSession()).rejects.toMatchObject({
      code: "UNAUTHENTICATED",
      status: 401,
    });
  });

  it("returns the Session shape ({userId, businessId, email}) when a valid cookie exists", async () => {
    mockGetSession.mockResolvedValue(VALID_SESSION);

    await expect(requireSession()).resolves.toEqual(VALID_SESSION);
  });
});

describe("requireSessionOrRedirect", () => {
  beforeEach(() => {
    mockGetSession.mockReset();
    mockRedirect.mockReset();
  });

  it("redirects to /login (via next/navigation's redirect(), not a thrown ApiError) when no valid session cookie is present", async () => {
    mockGetSession.mockResolvedValue(null);

    await requireSessionOrRedirect();

    expect(mockRedirect).toHaveBeenCalledWith("/login");
  });

  it("returns the Session shape ({userId, businessId, email, role}) when a valid cookie exists, without redirecting", async () => {
    mockGetSession.mockResolvedValue(VALID_SESSION);

    await expect(requireSessionOrRedirect()).resolves.toEqual(VALID_SESSION);
    expect(mockRedirect).not.toHaveBeenCalled();
  });
});
