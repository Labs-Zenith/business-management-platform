import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/server/api-error";
import type { Session } from "@/lib/services/ports";

const mockGetSession = vi.fn<() => Promise<Session | null>>();
const mockRedirect = vi.fn();
const mockNotFound = vi.fn(() => {
  // Mirrors Next.js's real `notFound()`: throws a special digest-tagged
  // error rather than returning, so callers never fall through past it.
  throw Object.assign(new Error("NEXT_HTTP_ERROR_FALLBACK;404"), {
    digest: "NEXT_HTTP_ERROR_FALLBACK;404",
  });
});

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
  notFound: () => mockNotFound(),
}));

import {
  getSession,
  requireCapability,
  requireCapabilityOrNotFound,
  requireSession,
  requireSessionOrRedirect,
} from "./session";

const ADMIN_SESSION: Session = {
  userId: "20000000-0000-4000-8000-000000000001",
  businessId: "10000000-0000-4000-8000-000000000001",
  email: "demo@negociodemo.test",
  role: "admin",
};

const WORKER_SESSION: Session = {
  userId: "20000000-0000-4000-8000-000000000002",
  businessId: "10000000-0000-4000-8000-000000000001",
  email: "worker@negociodemo.test",
  role: "worker",
};

const VALID_SESSION = ADMIN_SESSION;

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

/**
 * `requireCapability` / `requireCapabilityOrNotFound`, per
 * `openspec/changes/nomina-payroll/specs/role-based-navigation/spec.md`'s
 * "Reusable Capability-Check Helpers" requirement — the app's first
 * role-gated surface. Both resolve the session themselves (like
 * `requireSession`/`requireSessionOrRedirect`) so route/page call sites are
 * a single line, then delegate to the real `lib/services/permissions.ts`
 * `can()` deny-by-default map (not mocked — it's a pure function with no
 * dependency on the mocked `repositories` module).
 */
describe("requireCapability", () => {
  beforeEach(() => {
    mockGetSession.mockReset();
  });

  it("throws UNAUTHENTICATED (via requireSession) when no session is present, before any capability check", async () => {
    mockGetSession.mockResolvedValue(null);

    await expect(requireCapability("viewPayroll")).rejects.toMatchObject({
      code: "UNAUTHENTICATED",
      status: 401,
    });
  });

  it("throws a FORBIDDEN ApiError when the session's role lacks the capability (worker)", async () => {
    mockGetSession.mockResolvedValue(WORKER_SESSION);

    await expect(requireCapability("viewPayroll")).rejects.toBeInstanceOf(ApiError);
    await expect(requireCapability("viewPayroll")).rejects.toMatchObject({
      code: "FORBIDDEN",
      status: 403,
    });
  });

  it("resolves with the session when the role holds the capability (admin)", async () => {
    mockGetSession.mockResolvedValue(ADMIN_SESSION);

    await expect(requireCapability("viewPayroll")).resolves.toEqual(ADMIN_SESSION);
  });
});

describe("requireCapabilityOrNotFound", () => {
  beforeEach(() => {
    mockGetSession.mockReset();
    mockRedirect.mockReset();
    mockNotFound.mockClear();
  });

  it("redirects to /login (via requireSessionOrRedirect) when no session is present, before any capability check", async () => {
    mockGetSession.mockResolvedValue(null);
    // Matches real Next.js `redirect()`, which throws its `NEXT_REDIRECT`
    // signal rather than returning — unlike the bare `requireSessionOrRedirect`
    // tests above, this test chains further logic after the call, so the
    // mock must behave like the real function to prove capability-checking
    // code never runs on the unauthenticated path.
    mockRedirect.mockImplementation(() => {
      throw Object.assign(new Error("NEXT_REDIRECT"), { digest: "NEXT_REDIRECT;replace;/login;307;" });
    });

    await expect(requireCapabilityOrNotFound("viewPayroll")).rejects.toMatchObject({
      digest: expect.stringContaining("NEXT_REDIRECT"),
    });

    expect(mockRedirect).toHaveBeenCalledWith("/login");
    expect(mockNotFound).not.toHaveBeenCalled();
  });

  it("calls next/navigation's notFound() when the session's role lacks the capability (worker) — no page content path continues", async () => {
    mockGetSession.mockResolvedValue(WORKER_SESSION);

    await expect(requireCapabilityOrNotFound("viewPayroll")).rejects.toMatchObject({
      digest: "NEXT_HTTP_ERROR_FALLBACK;404",
    });
    expect(mockNotFound).toHaveBeenCalledTimes(1);
  });

  it("resolves with the session when the role holds the capability (admin), without calling notFound()", async () => {
    mockGetSession.mockResolvedValue(ADMIN_SESSION);

    await expect(requireCapabilityOrNotFound("viewPayroll")).resolves.toEqual(ADMIN_SESSION);
    expect(mockNotFound).not.toHaveBeenCalled();
  });
});
