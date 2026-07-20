import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetStore } from "@/lib/mock/store";
import { DEMO_USER_ID } from "@/lib/mock/fixtures/data";

/**
 * Integration test for the `switch-account` route, mirroring
 * `switch-business-route.test.ts`: an in-memory cookie jar fakes
 * `next/headers`'s `cookies()` so the REAL mock `authAdapter` ->
 * `session.ts` -> route handler path runs, only the storage is faked.
 *
 * The mock backend only authenticates the single demo credential pair, so a
 * true two-distinct-users switch isn't reachable here — these tests cover
 * the route's Part B authorization contract instead: NO prior active
 * session is required anymore (only `checkOrigin` + possession of the
 * `saved_accounts` entry), an unsaved userId is rejected (its refresh token
 * was never stored on this device), extra fields are rejected (`.strict()`),
 * and a mismatched Origin is rejected (anti-CSRF).
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

const { POST: loginPost } = await import("../login/route");
const { POST: switchAccountPost } = await import("./route");

function buildSwitchRequest(body: unknown): Request {
  return new Request("http://localhost:3000/api/auth/switch-account", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function signInAsDemoUser(): Promise<void> {
  const response = await loginPost(
    new Request("http://localhost:3000/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "demo@negociodemo.test", password: "demo1234" }),
    })
  );
  expect(response.status).toBe(200);
}

const ORIGINAL_APP_ORIGIN = process.env.APP_ORIGIN;

describe("POST /api/auth/switch-account (integration)", () => {
  beforeEach(() => {
    resetStore();
    mockCookieJar.clear();
  });

  it("rejects a userId that is not among this device's saved accounts (its token was never stored), even with no session at all", async () => {
    const response = await switchAccountPost(
      buildSwitchRequest({ userId: "99999999-0000-4000-8000-000000000999" })
    );

    const body = await response.json();
    expect(response.status).toBe(400);
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  it("Part B: activates a saved account WITHOUT a prior active session — possession of saved_accounts is the authorization now", async () => {
    // Sign in once (populates both the session cookie AND saved_accounts),
    // then drop ONLY the session cookie — simulating a brand-new tab that
    // never carried the session cookie in the first place but still has the
    // long-lived saved_accounts cookie from a previous visit.
    await signInAsDemoUser();
    mockCookieJar.delete("session");

    const response = await switchAccountPost(buildSwitchRequest({ userId: DEMO_USER_ID }));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.session.userId).toBe(DEMO_USER_ID);
  });

  it("rejects an unknown extra field (strict schema — never accepts a client-supplied token)", async () => {
    await signInAsDemoUser();

    const response = await switchAccountPost(
      buildSwitchRequest({ userId: DEMO_USER_ID, refreshToken: "malicious" })
    );

    expect(response.status).toBe(400);
  });

  it("activates an already-saved account (the demo user is saved after login)", async () => {
    await signInAsDemoUser();

    const response = await switchAccountPost(buildSwitchRequest({ userId: DEMO_USER_ID }));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.session.userId).toBe(DEMO_USER_ID);
  });

  describe("with APP_ORIGIN configured", () => {
    beforeEach(() => {
      process.env.APP_ORIGIN = "http://localhost:3000";
    });

    afterEach(() => {
      if (ORIGINAL_APP_ORIGIN === undefined) {
        delete process.env.APP_ORIGIN;
      } else {
        process.env.APP_ORIGIN = ORIGINAL_APP_ORIGIN;
      }
    });

    it("enforces the origin check even without a prior session: a mismatched Origin is rejected with FORBIDDEN", async () => {
      await signInAsDemoUser();
      mockCookieJar.delete("session");

      const response = await switchAccountPost(
        new Request("http://localhost:3000/api/auth/switch-account", {
          method: "POST",
          headers: { "content-type": "application/json", origin: "http://evil.test" },
          body: JSON.stringify({ userId: DEMO_USER_ID }),
        })
      );

      expect(response.status).toBe(403);
      const body = await response.json();
      expect(body.error.code).toBe("FORBIDDEN");
    });

    it("accepts a matching Origin header", async () => {
      await signInAsDemoUser();

      const response = await switchAccountPost(
        new Request("http://localhost:3000/api/auth/switch-account", {
          method: "POST",
          headers: { "content-type": "application/json", origin: "http://localhost:3000" },
          body: JSON.stringify({ userId: DEMO_USER_ID }),
        })
      );

      expect(response.status).toBe(200);
    });
  });
});
