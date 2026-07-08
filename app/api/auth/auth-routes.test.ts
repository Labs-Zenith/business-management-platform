import { beforeEach, describe, expect, it, vi } from "vitest";
import { resetStore } from "@/lib/mock/store";

/**
 * `next/headers`'s `cookies()` only works inside a real Next.js request
 * context (AsyncLocalStorage-backed). Calling route handler exports
 * directly in Vitest bypasses that context entirely, so we mock the
 * primitive with a small stateful, in-memory cookie jar shared across a
 * single test — this exercises the REAL `authAdapter` -> `session.ts` ->
 * route handler code path, only faking the underlying storage.
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

const { POST: loginPost } = await import("./login/route");
const { POST: logoutPost } = await import("./logout/route");

function buildLoginRequest(body: unknown): Request {
  return new Request("http://localhost:3000/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/auth/login and /api/auth/logout (integration)", () => {
  beforeEach(() => {
    resetStore();
    mockCookieJar.clear();
  });

  it("rejects a protected route/handler (logout) with 401 UNAUTHENTICATED when no session cookie is present", async () => {
    const response = await logoutPost();

    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.error.code).toBe("UNAUTHENTICATED");
  });

  it("logs in with valid demo credentials, sets a session cookie, and then logout succeeds with it", async () => {
    const loginResponse = await loginPost(
      buildLoginRequest({ email: "demo@negociodemo.test", password: "demo1234" })
    );

    expect(loginResponse.status).toBe(200);
    const loginBody = await loginResponse.json();
    expect(loginBody.data.session).toMatchObject({ email: "demo@negociodemo.test" });
    expect(mockCookieJar.get("session")).toBeDefined();

    const logoutResponse = await logoutPost();
    expect(logoutResponse.status).toBe(200);
    expect(mockCookieJar.get("session")).toBeUndefined();
  });

  it("rejects incorrect credentials with 401 UNAUTHENTICATED and never sets a cookie", async () => {
    const response = await loginPost(
      buildLoginRequest({ email: "demo@negociodemo.test", password: "wrong-password" })
    );

    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.error.code).toBe("UNAUTHENTICATED");
    expect(mockCookieJar.get("session")).toBeUndefined();
  });

  it("rejects a malformed payload (unknown field) with 400 VALIDATION_ERROR", async () => {
    const response = await loginPost(
      buildLoginRequest({ email: "demo@negociodemo.test", password: "demo1234", businessId: "hacked" })
    );

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  it("sets Cache-Control: no-store on responses", async () => {
    const response = await logoutPost();
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
});
