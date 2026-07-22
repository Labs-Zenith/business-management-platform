import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetStore } from "@/lib/mock/store";
import { DEMO_USER_ID } from "@/lib/mock/fixtures/data";

/**
 * Integration test for the `remove-account` route, mirroring
 * `switch-account/switch-account-route.test.ts`: an in-memory cookie jar
 * fakes `next/headers`'s `cookies()` so the REAL mock `authAdapter` ->
 * route handler path runs, only the storage is faked.
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
const { POST: removeAccountPost } = await import("./route");

function buildRemoveRequest(body: unknown): Request {
  return new Request("http://localhost:3000/api/auth/remove-account", {
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

describe("POST /api/auth/remove-account (integration)", () => {
  beforeEach(() => {
    resetStore();
    mockCookieJar.clear();
  });

  it("rejects a userId that is not among this device's saved accounts", async () => {
    const response = await removeAccountPost(
      buildRemoveRequest({ userId: "99999999-0000-4000-8000-000000000999" })
    );

    const body = await response.json();
    expect(response.status).toBe(400);
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  it("removes a saved account (the demo user is saved after login)", async () => {
    await signInAsDemoUser();

    const response = await removeAccountPost(buildRemoveRequest({ userId: DEMO_USER_ID }));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.ok).toBe(true);
  });

  it("rejects an unknown extra field (strict schema)", async () => {
    await signInAsDemoUser();

    const response = await removeAccountPost(
      buildRemoveRequest({ userId: DEMO_USER_ID, extra: "nope" })
    );

    expect(response.status).toBe(400);
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

    it("enforces the origin check: a mismatched Origin is rejected with FORBIDDEN", async () => {
      await signInAsDemoUser();

      const response = await removeAccountPost(
        new Request("http://localhost:3000/api/auth/remove-account", {
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

      const response = await removeAccountPost(
        new Request("http://localhost:3000/api/auth/remove-account", {
          method: "POST",
          headers: { "content-type": "application/json", origin: "http://localhost:3000" },
          body: JSON.stringify({ userId: DEMO_USER_ID }),
        })
      );

      expect(response.status).toBe(200);
    });
  });
});
