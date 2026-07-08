import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetStore } from "@/lib/mock/store";
import { repositories } from "@/lib/services/repositories";

/**
 * Same in-memory cookie jar strategy as
 * `app/api/dashboard/summary/dashboard-routes.test.ts` /
 * `app/api/customers/customers-routes.test.ts`: `next/headers`'s `cookies()`
 * only works inside a real Next.js request context, so this mocks the
 * primitive with a stateful jar shared across a single test — exercising
 * the REAL `authAdapter` -> `session.ts` -> route handler code path, only
 * faking the underlying cookie storage.
 */
const { mockCookieJar } = vi.hoisted(() => {
  const jarStore = new Map<string, string>();
  return {
    mockCookieJar: {
      get(name: string) {
        return jarStore.has(name) ? { name, value: jarStore.get(name)! } : undefined;
      },
      set(name: string, value: string) {
        jarStore.set(name, value);
      },
      delete(name: string) {
        jarStore.delete(name);
      },
      clear() {
        jarStore.clear();
      },
    },
  };
});

vi.mock("next/headers", () => ({
  cookies: async () => mockCookieJar,
}));

const { GET } = await import("./route");

const DEMO_EMAIL = "demo@negociodemo.test";
const DEMO_PASSWORD = "demo1234";

async function signIn(): Promise<void> {
  const session = await repositories.auth.signIn(DEMO_EMAIL, DEMO_PASSWORD);
  if (!session) {
    throw new Error("Test setup failed: demo sign-in did not succeed.");
  }
}

describe("GET /api/openapi.json", () => {
  const ORIGINAL_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

  beforeEach(() => {
    resetStore();
    mockCookieJar.clear();
    // Secret-leak canary — must never appear in the JSON response body.
    process.env.SUPABASE_SERVICE_ROLE_KEY = "route-level-leak-marker-abc123";
  });

  afterEach(() => {
    if (ORIGINAL_SERVICE_ROLE_KEY === undefined) {
      delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    } else {
      process.env.SUPABASE_SERVICE_ROLE_KEY = ORIGINAL_SERVICE_ROLE_KEY;
    }
  });

  it("rejects unauthenticated requests with 401 UNAUTHENTICATED", async () => {
    const response = await GET();

    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.error.code).toBe("UNAUTHENTICATED");
  });

  it("returns a valid OpenAPI 3 document with Cache-Control: no-store when authenticated", async () => {
    await signIn();

    const response = await GET();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");

    const body = await response.json();
    expect(body.openapi).toBe("3.0.0");
    expect(body.paths["/api/customers"].get).toBeDefined();
    expect(body.paths["/api/business"]).toBeUndefined();
  });

  it("never leaks a secret/env-var value in the served JSON", async () => {
    await signIn();

    const response = await GET();
    const rawText = await response.text();

    expect(rawText).not.toContain("route-level-leak-marker-abc123");
    expect(rawText.toLowerCase()).not.toContain("service_role_key");
  });
});
