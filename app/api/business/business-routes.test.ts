import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetStore, store } from "@/lib/mock/store";
import { repositories } from "@/lib/services/repositories";

/**
 * Same in-memory cookie jar strategy as
 * `app/api/customers/customers-routes.test.ts`: `next/headers`'s `cookies()`
 * only works inside a real Next.js request context, so this mocks the
 * primitive with a stateful jar shared across a single test — this exercises
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

const { PATCH: businessPatch } = await import("./route");

const BUSINESS_ID = "10000000-0000-4000-8000-000000000001";
const DEMO_EMAIL = "demo@negociodemo.test";
const DEMO_PASSWORD = "demo1234";

async function signIn(): Promise<void> {
  const session = await repositories.auth.signIn(DEMO_EMAIL, DEMO_PASSWORD);
  if (!session) {
    throw new Error("Test setup failed: demo sign-in did not succeed.");
  }
}

/**
 * Signs in as the demo admin, then re-issues the session cookie with role
 * `"worker"` in the SAME business (mirrors
 * `app/api/employees/employees-routes.test.ts`'s `signInAsWorker` helper) —
 * this exercises the REAL `updateBusinessProfile` -> `permissions.can()`
 * check, unmocked.
 */
async function signInAsWorker(): Promise<void> {
  await signIn();
  const switched = await repositories.auth.switchBusiness(BUSINESS_ID, "worker");
  if (!switched) {
    throw new Error("Test setup failed: switchBusiness to worker did not succeed.");
  }
}

const ORIGINAL_APP_ORIGIN = process.env.APP_ORIGIN;

describe("PATCH /api/business", () => {
  beforeEach(() => {
    resetStore();
    mockCookieJar.clear();
    process.env.APP_ORIGIN = "http://localhost:3000";
  });

  afterEach(() => {
    if (ORIGINAL_APP_ORIGIN === undefined) {
      delete process.env.APP_ORIGIN;
    } else {
      process.env.APP_ORIGIN = ORIGINAL_APP_ORIGIN;
    }
  });

  it("rejects unauthenticated requests with 401 UNAUTHENTICATED", async () => {
    const response = await businessPatch(
      new Request("http://localhost:3000/api/business", {
        method: "PATCH",
        headers: { "content-type": "application/json", origin: "http://localhost:3000" },
        body: JSON.stringify({ name: "Nuevo Nombre" }),
      }),
    );

    expect(response.status).toBe(401);
  });

  it("rejects a worker session with 403 FORBIDDEN (lacks editBusinessProfile), applying no change", async () => {
    await signInAsWorker();
    const before = store.businesses.get(BUSINESS_ID);

    const response = await businessPatch(
      new Request("http://localhost:3000/api/business", {
        method: "PATCH",
        headers: { "content-type": "application/json", origin: "http://localhost:3000" },
        body: JSON.stringify({ name: "Nombre De Worker" }),
      }),
    );

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error.code).toBe("FORBIDDEN");
    expect(store.businesses.get(BUSINESS_ID)?.name).toBe(before?.name);
  });

  it("allows an admin session to update the business profile", async () => {
    await signIn();

    const response = await businessPatch(
      new Request("http://localhost:3000/api/business", {
        method: "PATCH",
        headers: { "content-type": "application/json", origin: "http://localhost:3000" },
        body: JSON.stringify({ name: "Nombre De Admin" }),
      }),
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.name).toBe("Nombre De Admin");
  });

  it("applies a valid descriptive update to the session's own business", async () => {
    await signIn();

    const response = await businessPatch(
      new Request("http://localhost:3000/api/business", {
        method: "PATCH",
        headers: { "content-type": "application/json", origin: "http://localhost:3000" },
        body: JSON.stringify({ name: "Negocio Renombrado", phone: "3009999999" }),
      }),
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.name).toBe("Negocio Renombrado");
    expect(body.data.phone).toBe("3009999999");
    expect(body.data.id).toBe(BUSINESS_ID);
  });

  it("applies a currency-only update", async () => {
    await signIn();

    const response = await businessPatch(
      new Request("http://localhost:3000/api/business", {
        method: "PATCH",
        headers: { "content-type": "application/json", origin: "http://localhost:3000" },
        body: JSON.stringify({ currency: "USD" }),
      }),
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.currency).toBe("USD");
  });

  it("rejects (via strict schema) a forged business_id/id field with 400 VALIDATION_ERROR, applying no change", async () => {
    await signIn();
    const before = store.businesses.get(BUSINESS_ID);

    const response = await businessPatch(
      new Request("http://localhost:3000/api/business", {
        method: "PATCH",
        headers: { "content-type": "application/json", origin: "http://localhost:3000" },
        body: JSON.stringify({ business_id: "hacked", id: "hacked-id" }),
      }),
    );

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(store.businesses.get(BUSINESS_ID)?.name).toBe(before?.name);
  });

  it("rejects an empty payload with 400 VALIDATION_ERROR", async () => {
    await signIn();

    const response = await businessPatch(
      new Request("http://localhost:3000/api/business", {
        method: "PATCH",
        headers: { "content-type": "application/json", origin: "http://localhost:3000" },
        body: JSON.stringify({}),
      }),
    );

    expect(response.status).toBe(400);
  });

  it("rejects a mismatched Origin header with 403 FORBIDDEN before touching the store", async () => {
    await signIn();

    const response = await businessPatch(
      new Request("http://localhost:3000/api/business", {
        method: "PATCH",
        headers: { "content-type": "application/json", origin: "http://evil.test" },
        body: JSON.stringify({ name: "Nombre Malicioso" }),
      }),
    );

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error.code).toBe("FORBIDDEN");
    expect(store.businesses.get(BUSINESS_ID)?.name).not.toBe("Nombre Malicioso");
  });

  it("sets Cache-Control: no-store on the response", async () => {
    await signIn();

    const response = await businessPatch(
      new Request("http://localhost:3000/api/business", {
        method: "PATCH",
        headers: { "content-type": "application/json", origin: "http://localhost:3000" },
        body: JSON.stringify({ name: "Otro Nombre" }),
      }),
    );

    expect(response.headers.get("cache-control")).toBe("no-store");
  });
});
