import { beforeEach, describe, expect, it, vi } from "vitest";
import { resetStore } from "@/lib/mock/store";
import { DEMO_USER_ID } from "@/lib/mock/fixtures/data";

/**
 * Integration test for the Wave 3 `switch-account` route, mirroring
 * `switch-business-route.test.ts`: an in-memory cookie jar fakes
 * `next/headers`'s `cookies()` so the REAL mock `authAdapter` ->
 * `session.ts` -> route handler path runs, only the storage is faked.
 *
 * The mock backend only authenticates the single demo credential pair, so a
 * true two-distinct-users switch isn't reachable here — these tests cover the
 * route's authorization contract instead: no session -> 401, an unsaved
 * userId -> rejected (its refresh token was never stored on this device), and
 * an already-saved userId -> accepted.
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

describe("POST /api/auth/switch-account (integration)", () => {
  beforeEach(() => {
    resetStore();
    mockCookieJar.clear();
  });

  it("rejects with 401 when there is no active session", async () => {
    const response = await switchAccountPost(buildSwitchRequest({ userId: DEMO_USER_ID }));
    expect(response.status).toBe(401);
  });

  it("rejects a userId that is not among this device's saved accounts (its token was never stored)", async () => {
    await signInAsDemoUser();

    const response = await switchAccountPost(
      buildSwitchRequest({ userId: "99999999-0000-4000-8000-000000000999" })
    );

    const body = await response.json();
    expect(response.status).toBe(400);
    expect(body.error.code).toBe("VALIDATION_ERROR");
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
});
