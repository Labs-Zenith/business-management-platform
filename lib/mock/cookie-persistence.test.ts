import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextResponse } from "next/server";
import { DEMO_USER_ID } from "@/lib/mock/fixtures/data";

/**
 * `next/headers`'s `cookies()` only works inside a real Next.js request
 * context — mocked here the same way as `lib/mock/auth-adapter.test.ts`.
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

const { loadStoreFromCookie, saveStoreToCookie } = await import("./cookie-persistence");
const { store, resetStore } = await import("./store");

describe("cookie-persistence round-trip — profiles Map re-keyed by profile `id` (not `userId`)", () => {
  beforeEach(() => {
    resetStore();
    mockCookieJar.clear();
  });

  it("preserves BOTH seeded memberships for the same userId across a full saveStoreToCookie -> loadStoreFromCookie round-trip", async () => {
    // Sanity: the seeded demo store has 2 profiles sharing DEMO_USER_ID
    // (one per business membership) before anything touches the cookie.
    const beforeProfiles = [...store.profiles.values()].filter((p) => p.userId === DEMO_USER_ID);
    expect(beforeProfiles).toHaveLength(2);

    // 1. Save (serialize) the current store onto a fake response's `app_data` cookie.
    const setCookieSpy = vi.fn();
    const fakeResponse = { cookies: { set: setCookieSpy } } as unknown as NextResponse;
    saveStoreToCookie(fakeResponse);

    expect(setCookieSpy).toHaveBeenCalledTimes(1);
    const [cookieName, cookieValue] = setCookieSpy.mock.calls[0] as [string, string, unknown];
    expect(cookieName).toBe("app_data");

    // 2. Simulate the cookie arriving on a fresh request (e.g. a different
    // serverless instance) and load (deserialize+hydrate) from it.
    mockCookieJar.set("app_data", cookieValue);
    await loadStoreFromCookie();

    // 3. Both memberships for DEMO_USER_ID must still be present, each under
    // its own profile `id` key — the bug this guards against re-keyed the
    // `profiles` Map by `userId`, so the second profile silently overwrote
    // the first on hydration, losing a membership on every cookie round-trip.
    const afterProfiles = [...store.profiles.values()].filter((p) => p.userId === DEMO_USER_ID);
    expect(afterProfiles).toHaveLength(2);
    const afterProfileIds = new Set(afterProfiles.map((p) => p.id));
    expect(afterProfileIds.size).toBe(2);
    const beforeProfileIds = new Set(beforeProfiles.map((p) => p.id));
    expect(afterProfileIds).toEqual(beforeProfileIds);
  });
});
