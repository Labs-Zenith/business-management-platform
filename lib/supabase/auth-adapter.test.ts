import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BusinessMembership } from "@/lib/services/ports";

/**
 * `next/headers`'s `cookies()` only works inside a real Next.js request
 * context (AsyncLocalStorage-backed). Same in-memory cookie jar pattern as
 * `lib/mock/auth-adapter.test.ts`.
 */
const { mockCookieJar } = vi.hoisted(() => {
  const store = new Map<string, string>();
  return {
    mockCookieJar: {
      get(name: string) {
        return store.has(name) ? { name, value: store.get(name)! } : undefined;
      },
      set(name: string, value: string) {
        store.set(name, value);
      },
      delete(name: string) {
        store.delete(name);
      },
      clear() {
        store.clear();
      },
    },
  };
});

vi.mock("next/headers", () => ({
  cookies: async () => mockCookieJar,
}));

/** Fake Supabase auth surface — controllable per-test via these `vi.fn()`s. */
const { mockSupabaseAuth } = vi.hoisted(() => ({
  mockSupabaseAuth: {
    signInWithPassword: vi.fn(),
    getUser: vi.fn(),
    signOut: vi.fn(),
  },
}));

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: async () => ({ auth: mockSupabaseAuth }),
}));

const mockListMembershipsForUser = vi.hoisted(() => vi.fn<() => Promise<BusinessMembership[]>>());

vi.mock("@/lib/services/repositories", () => ({
  repositories: { business: { listMembershipsForUser: mockListMembershipsForUser } },
}));

const { supabaseAuthAdapter } = await import("./auth-adapter");

const USER_ID = "auth-user-1";
const EMAIL = "demo@negociodemo.test";
const BUSINESS_A = "10000000-0000-4000-8000-000000000001";
const BUSINESS_B = "10000000-0000-4000-8000-000000000002";

const membershipsFixture: BusinessMembership[] = [
  { businessId: BUSINESS_A, businessName: "Negocio Demo", role: "admin" },
  { businessId: BUSINESS_B, businessName: "Negocio Demo 2", role: "worker" },
];

describe("supabaseAuthAdapter.signIn", () => {
  beforeEach(() => {
    mockCookieJar.clear();
    mockSupabaseAuth.signInWithPassword.mockReset();
    mockSupabaseAuth.getUser.mockReset();
    mockSupabaseAuth.signOut.mockReset();
    mockListMembershipsForUser.mockReset();
  });

  it("returns null when Supabase rejects the credentials", async () => {
    mockSupabaseAuth.signInWithPassword.mockResolvedValue({
      data: { user: null },
      error: { message: "Invalid login credentials" },
    });

    const session = await supabaseAuthAdapter.signIn(EMAIL, "wrong-password");

    expect(session).toBeNull();
    expect(mockCookieJar.get("active_business_id")).toBeUndefined();
  });

  it("returns null when the user has no business membership", async () => {
    mockSupabaseAuth.signInWithPassword.mockResolvedValue({
      data: { user: { id: USER_ID, email: EMAIL } },
      error: null,
    });
    mockListMembershipsForUser.mockResolvedValue([]);

    const session = await supabaseAuthAdapter.signIn(EMAIL, "correct-password");

    expect(session).toBeNull();
  });

  it("on success, resolves the session against the first membership and sets active_business_id", async () => {
    mockSupabaseAuth.signInWithPassword.mockResolvedValue({
      data: { user: { id: USER_ID, email: EMAIL } },
      error: null,
    });
    mockListMembershipsForUser.mockResolvedValue(membershipsFixture);

    const session = await supabaseAuthAdapter.signIn(EMAIL, "correct-password");

    expect(session).toEqual({ userId: USER_ID, businessId: BUSINESS_A, email: EMAIL, role: "admin" });
    expect(mockCookieJar.get("active_business_id")?.value).toBe(BUSINESS_A);
  });
});

describe("supabaseAuthAdapter.getSession", () => {
  beforeEach(() => {
    mockCookieJar.clear();
    mockSupabaseAuth.signInWithPassword.mockReset();
    mockSupabaseAuth.getUser.mockReset();
    mockSupabaseAuth.signOut.mockReset();
    mockListMembershipsForUser.mockReset();
  });

  it("returns null when there is no authenticated Supabase user", async () => {
    mockSupabaseAuth.getUser.mockResolvedValue({ data: { user: null } });

    const session = await supabaseAuthAdapter.getSession();

    expect(session).toBeNull();
  });

  it("returns null when the authenticated user has no membership", async () => {
    mockSupabaseAuth.getUser.mockResolvedValue({ data: { user: { id: USER_ID, email: EMAIL } } });
    mockListMembershipsForUser.mockResolvedValue([]);

    const session = await supabaseAuthAdapter.getSession();

    expect(session).toBeNull();
  });

  it("falls back to the first membership when active_business_id cookie is absent", async () => {
    mockSupabaseAuth.getUser.mockResolvedValue({ data: { user: { id: USER_ID, email: EMAIL } } });
    mockListMembershipsForUser.mockResolvedValue(membershipsFixture);

    const session = await supabaseAuthAdapter.getSession();

    expect(session).toEqual({ userId: USER_ID, businessId: BUSINESS_A, email: EMAIL, role: "admin" });
  });

  it("resolves the active business from the active_business_id cookie, with role fresh from memberships", async () => {
    mockSupabaseAuth.getUser.mockResolvedValue({ data: { user: { id: USER_ID, email: EMAIL } } });
    mockListMembershipsForUser.mockResolvedValue(membershipsFixture);
    mockCookieJar.set("active_business_id", BUSINESS_B);

    const session = await supabaseAuthAdapter.getSession();

    expect(session).toEqual({ userId: USER_ID, businessId: BUSINESS_B, email: EMAIL, role: "worker" });
  });

  it("falls back to the first membership when the cookie references a business the user is not a member of", async () => {
    mockSupabaseAuth.getUser.mockResolvedValue({ data: { user: { id: USER_ID, email: EMAIL } } });
    mockListMembershipsForUser.mockResolvedValue(membershipsFixture);
    mockCookieJar.set("active_business_id", "10000000-0000-4000-8000-00000000dead");

    const session = await supabaseAuthAdapter.getSession();

    expect(session).toEqual({ userId: USER_ID, businessId: BUSINESS_A, email: EMAIL, role: "admin" });
  });
});

describe("supabaseAuthAdapter.signOut", () => {
  beforeEach(() => {
    mockCookieJar.clear();
    mockSupabaseAuth.signOut.mockReset();
  });

  it("calls supabase.auth.signOut() and clears the active_business_id cookie", async () => {
    mockCookieJar.set("active_business_id", BUSINESS_A);
    mockSupabaseAuth.signOut.mockResolvedValue({ error: null });

    await supabaseAuthAdapter.signOut();

    expect(mockSupabaseAuth.signOut).toHaveBeenCalledTimes(1);
    expect(mockCookieJar.get("active_business_id")).toBeUndefined();
  });
});

describe("supabaseAuthAdapter.switchBusiness", () => {
  beforeEach(() => {
    mockCookieJar.clear();
    mockSupabaseAuth.getUser.mockReset();
  });

  it("returns null when there is no authenticated Supabase user", async () => {
    mockSupabaseAuth.getUser.mockResolvedValue({ data: { user: null } });

    const result = await supabaseAuthAdapter.switchBusiness(BUSINESS_B, "worker");

    expect(result).toBeNull();
    expect(mockCookieJar.get("active_business_id")).toBeUndefined();
  });

  /**
   * Mirrors `lib/mock/auth-adapter.ts`'s documented contract: performs NO
   * membership verification of its own — the caller (the switch-business
   * route) already verified via `listMembershipsForUser`.
   */
  it("sets the active_business_id cookie and returns the session, trusting the caller completely", async () => {
    mockSupabaseAuth.getUser.mockResolvedValue({ data: { user: { id: USER_ID, email: EMAIL } } });

    const result = await supabaseAuthAdapter.switchBusiness(BUSINESS_B, "worker");

    expect(result).toEqual({ userId: USER_ID, businessId: BUSINESS_B, email: EMAIL, role: "worker" });
    expect(mockCookieJar.get("active_business_id")?.value).toBe(BUSINESS_B);
  });
});
