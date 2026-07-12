import { beforeEach, describe, expect, it, vi } from "vitest";
import { resetStore } from "@/lib/mock/store";
import { BUSINESS_ID, BUSINESS_ID_2 } from "@/lib/mock/fixtures/data";

/**
 * `next/headers`'s `cookies()` only works inside a real Next.js request
 * context (AsyncLocalStorage-backed). Calling route handler exports
 * directly in Vitest bypasses that context entirely, so we mock the
 * primitive with a small stateful, in-memory cookie jar shared across a
 * single test — this exercises the REAL `authAdapter` -> `session.ts` ->
 * route handler code path, only faking the underlying storage. Mirrors
 * `app/api/auth/auth-routes.test.ts`.
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
const { POST: switchBusinessPost } = await import("./route");

function buildLoginRequest(body: unknown): Request {
  return new Request("http://localhost:3000/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function buildSwitchRequest(body: unknown): Request {
  return new Request("http://localhost:3000/api/auth/switch-business", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function signInAsDemoUser(): Promise<string> {
  const response = await loginPost(
    buildLoginRequest({ email: "demo@negociodemo.test", password: "demo1234" })
  );
  expect(response.status).toBe(200);
  return mockCookieJar.get("session")!.value;
}

describe("POST /api/auth/switch-business (integration)", () => {
  beforeEach(() => {
    resetStore();
    mockCookieJar.clear();
  });

  it("rejects an unauthenticated request with 401 UNAUTHENTICATED and does not set a cookie", async () => {
    const response = await switchBusinessPost(buildSwitchRequest({ businessId: BUSINESS_ID_2 }));

    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.error.code).toBe("UNAUTHENTICATED");
    expect(mockCookieJar.get("session")).toBeUndefined();
  });

  it("switches to the user's 2nd demo business and returns the new session with the right role", async () => {
    const original = JSON.parse(
      Buffer.from(
        (await signInAsDemoUser()).split(".")[0]!,
        "base64url"
      ).toString("utf-8")
    ) as { userId: string; email: string };
    const sessionBefore = mockCookieJar.get("session")!.value;

    const response = await switchBusinessPost(buildSwitchRequest({ businessId: BUSINESS_ID_2 }));

    expect(response.status).toBe(200);
    const body = await response.json();
    // Full session shape: userId/email preserved unchanged across the
    // switch, businessId/role updated to the target membership's own values.
    expect(body.data.session).toEqual({
      userId: original.userId,
      email: original.email,
      businessId: BUSINESS_ID_2,
      role: "admin",
    });
    expect(mockCookieJar.get("session")!.value).not.toBe(sessionBefore);
  });

  it("rejects switching to a business the user has no membership in with 403 and does not mutate the session cookie", async () => {
    await signInAsDemoUser();
    const sessionBefore = mockCookieJar.get("session")!.value;

    const response = await switchBusinessPost(
      buildSwitchRequest({ businessId: "99999999-0000-4000-8000-000000000099" })
    );

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error.code).toBe("FORBIDDEN");
    expect(mockCookieJar.get("session")!.value).toBe(sessionBefore);
  });

  it("rejects a malformed payload (unknown field) with 400 VALIDATION_ERROR", async () => {
    await signInAsDemoUser();

    const response = await switchBusinessPost(
      buildSwitchRequest({ businessId: BUSINESS_ID, role: "admin" })
    );

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  it("rejects a payload missing businessId entirely with 400 VALIDATION_ERROR", async () => {
    await signInAsDemoUser();

    const response = await switchBusinessPost(buildSwitchRequest({}));

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  it("rejects an empty-string businessId (z.string().min(1) boundary) with 400 VALIDATION_ERROR", async () => {
    await signInAsDemoUser();

    const response = await switchBusinessPost(buildSwitchRequest({ businessId: "" }));

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  it("rejects a wrong-type businessId (a number) with 400 VALIDATION_ERROR", async () => {
    await signInAsDemoUser();

    const response = await switchBusinessPost(buildSwitchRequest({ businessId: 12345 }));

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  it("rejects malformed/invalid JSON body with 400 VALIDATION_ERROR", async () => {
    await signInAsDemoUser();

    const malformedRequest = new Request("http://localhost:3000/api/auth/switch-business", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{ not valid json",
    });
    const response = await switchBusinessPost(malformedRequest);

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  it("sets Cache-Control: no-store on responses", async () => {
    await signInAsDemoUser();

    const response = await switchBusinessPost(buildSwitchRequest({ businessId: BUSINESS_ID_2 }));
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("sets Cache-Control: no-store on error responses too, not just the 200 success path", async () => {
    // 401 (unauthenticated) error path.
    const unauthenticatedResponse = await switchBusinessPost(
      buildSwitchRequest({ businessId: BUSINESS_ID_2 })
    );
    expect(unauthenticatedResponse.status).toBe(401);
    expect(unauthenticatedResponse.headers.get("cache-control")).toBe("no-store");

    // 403 (non-member) error path.
    await signInAsDemoUser();
    const forbiddenResponse = await switchBusinessPost(
      buildSwitchRequest({ businessId: "99999999-0000-4000-8000-000000000099" })
    );
    expect(forbiddenResponse.status).toBe(403);
    expect(forbiddenResponse.headers.get("cache-control")).toBe("no-store");

    // 400 (validation) error path.
    const validationResponse = await switchBusinessPost(buildSwitchRequest({}));
    expect(validationResponse.status).toBe(400);
    expect(validationResponse.headers.get("cache-control")).toBe("no-store");
  });
});
