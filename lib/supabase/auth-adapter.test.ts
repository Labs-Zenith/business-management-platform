import { beforeEach, describe, expect, it, vi } from "vitest";
import { openJson, sealJson } from "@/lib/server/cookie-crypto";
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
    // Wave 3: signIn/switchAccount capture the current session's refresh token
    // and exchange a saved one. Default to "no current session" / a fresh
    // rotated token so existing signIn/getSession tests aren't affected.
    getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
    refreshSession: vi.fn().mockResolvedValue({
      data: { session: { refresh_token: "rotated-token", user: { id: "auth-user-1", email: "demo@negociodemo.test" } } },
      error: null,
    }),
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
      data: {
        user: { id: USER_ID, email: EMAIL },
        session: { refresh_token: "token-a", user: { id: USER_ID, email: EMAIL } },
      },
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
    mockSupabaseAuth.getUser.mockResolvedValue({ data: { user: null } });
    mockSupabaseAuth.signOut.mockResolvedValue({ error: null });

    await supabaseAuthAdapter.signOut();

    expect(mockSupabaseAuth.signOut).toHaveBeenCalledTimes(1);
    expect(mockCookieJar.get("active_business_id")).toBeUndefined();
  });

  it("does NOT re-add the signed-out account when falling back to a next saved account (security regression guard)", async () => {
    const A_ID = "user-a";
    const B_ID = "user-b";
    mockCookieJar.set(
      "saved_accounts",
      sealJson([
        { userId: A_ID, email: "a@x.test", label: "a@x.test", refreshToken: "tok-a" },
        { userId: B_ID, email: "b@x.test", label: "b@x.test", refreshToken: "tok-b" },
      ])
    );
    // A is the currently-active account being signed out.
    mockSupabaseAuth.getUser.mockResolvedValue({ data: { user: { id: A_ID, email: "a@x.test" } } });
    mockSupabaseAuth.signOut.mockResolvedValue({ error: null });
    // After signOut, there is no active session to capture (this is the fix).
    mockSupabaseAuth.getSession.mockResolvedValue({ data: { session: null } });
    // Switching to B exchanges its stored token for a fresh session.
    mockSupabaseAuth.refreshSession.mockResolvedValue({
      data: {
        user: { id: B_ID, email: "b@x.test" },
        session: { refresh_token: "rot-b", user: { id: B_ID, email: "b@x.test" } },
      },
      error: null,
    });
    mockListMembershipsForUser.mockResolvedValue([
      { businessId: BUSINESS_A, businessName: "Negocio B", role: "admin" },
    ]);

    await supabaseAuthAdapter.signOut();

    const raw = mockCookieJar.get("saved_accounts")!.value;
    const saved = openJson<Array<{ userId: string }>>(raw)!;
    const ids = saved.map((a) => a.userId);
    expect(ids).not.toContain(A_ID); // the signed-out account is gone
    expect(ids).toContain(B_ID); // and we stayed logged in as the next one
    expect(mockSupabaseAuth.signOut).toHaveBeenCalledTimes(1);
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
