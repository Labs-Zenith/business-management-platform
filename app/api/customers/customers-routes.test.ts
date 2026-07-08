import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetStore, store } from "@/lib/mock/store";
import { repositories } from "@/lib/services/repositories";
import type { Customer } from "@/lib/services/ports";

/**
 * Same in-memory cookie jar strategy as `app/api/auth/auth-routes.test.ts`:
 * `next/headers`'s `cookies()` only works inside a real Next.js request
 * context, so this mocks the primitive with a stateful jar shared across a
 * single test — this exercises the REAL `authAdapter` -> `session.ts` ->
 * route handler code path, only faking the underlying cookie storage.
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

const { GET: listGet, POST: listPost } = await import("./route");
const { GET: detailGet, PATCH: detailPatch } = await import("./[id]/route");

const BUSINESS_ID = "10000000-0000-4000-8000-000000000001";
const OTHER_BUSINESS_ID = "10000000-0000-4000-8000-000000000099";
const DEMO_EMAIL = "demo@negociodemo.test";
const DEMO_PASSWORD = "demo1234";

function buildContext(id: string) {
  return { params: Promise.resolve({ id }) };
}

async function signIn(): Promise<void> {
  const session = await repositories.auth.signIn(DEMO_EMAIL, DEMO_PASSWORD);
  if (!session) {
    throw new Error("Test setup failed: demo sign-in did not succeed.");
  }
}

/** Seeds a customer under a DIFFERENT business, directly in the mock store. */
function seedOtherBusinessCustomer(): Customer {
  const customer: Customer = {
    id: "40000000-0000-4000-8000-000000000999",
    businessId: OTHER_BUSINESS_ID,
    name: "Cliente De Otro Negocio",
    documentNumber: null,
    email: null,
    phone: null,
    address: null,
    notes: null,
    isActive: true,
    createdAt: "2024-01-01T00:00:00.000Z",
    updatedAt: "2024-01-01T00:00:00.000Z",
  };
  store.customers.set(customer.id, customer);
  return customer;
}

const ORIGINAL_APP_ORIGIN = process.env.APP_ORIGIN;

describe("GET /api/customers", () => {
  beforeEach(() => {
    resetStore();
    mockCookieJar.clear();
  });

  it("rejects unauthenticated requests with 401 UNAUTHENTICATED", async () => {
    const response = await listGet(new Request("http://localhost:3000/api/customers"));

    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.error.code).toBe("UNAUTHENTICATED");
  });

  it("returns only the session business's customers, paginated, with Cache-Control: no-store", async () => {
    await signIn();
    seedOtherBusinessCustomer();

    const response = await listGet(new Request("http://localhost:3000/api/customers?page=1&pageSize=5"));

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const body = await response.json();
    expect(body.page).toBe(1);
    expect(body.pageSize).toBe(5);
    expect(body.data.length).toBeLessThanOrEqual(5);
    expect(body.data.every((c: { id: string }) => c.id !== "40000000-0000-4000-8000-000000000999")).toBe(true);
    expect(body.data.every((c: Customer) => c)).toBeTruthy();
  });

  it("respects pageSize and reports a total reflecting the full scoped count", async () => {
    await signIn();

    const pageOne = await listGet(new Request("http://localhost:3000/api/customers?page=1&pageSize=3"));
    const bodyOne = await pageOne.json();

    expect(bodyOne.data).toHaveLength(3);
    expect(bodyOne.total).toBeGreaterThanOrEqual(8); // 8 seeded fixtures for BUSINESS_ID

    const pageTwo = await listGet(new Request("http://localhost:3000/api/customers?page=2&pageSize=3"));
    const bodyTwo = await pageTwo.json();

    expect(bodyTwo.data[0].id).not.toBe(bodyOne.data[0].id);
  });

  it("rejects an invalid pageSize with 400 VALIDATION_ERROR", async () => {
    await signIn();

    const response = await listGet(new Request("http://localhost:3000/api/customers?pageSize=999"));

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });
});

describe("POST /api/customers", () => {
  beforeEach(() => {
    resetStore();
    mockCookieJar.clear();
  });

  it("rejects unauthenticated requests with 401 UNAUTHENTICATED", async () => {
    const response = await listPost(
      new Request("http://localhost:3000/api/customers", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "Nuevo Cliente" }),
      }),
    );

    expect(response.status).toBe(401);
  });

  it("creates a customer under the session's business, active by default", async () => {
    await signIn();

    const response = await listPost(
      new Request("http://localhost:3000/api/customers", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "Nuevo Cliente" }),
      }),
    );

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.data.name).toBe("Nuevo Cliente");
    expect(body.data.isActive).toBe(true);
    expect(body.data.businessId).toBe(BUSINESS_ID);
  });

  it("rejects (via strict schema) a forged business_id in the request body, ignoring it entirely — never creates under the forged business", async () => {
    await signIn();

    const response = await listPost(
      new Request("http://localhost:3000/api/customers", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "Cliente Forjado", business_id: OTHER_BUSINESS_ID }),
      }),
    );

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
    // Never silently created under the session's business with the forged
    // field stripped, either — the whole request is rejected.
    const created = [...store.customers.values()].filter((c) => c.name === "Cliente Forjado");
    expect(created).toHaveLength(0);
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

    it("rejects a mismatched Origin header with 403 FORBIDDEN before touching the store", async () => {
      await signIn();

      const response = await listPost(
        new Request("http://localhost:3000/api/customers", {
          method: "POST",
          headers: { "content-type": "application/json", origin: "http://evil.test" },
          body: JSON.stringify({ name: "Cliente Malicioso" }),
        }),
      );

      expect(response.status).toBe(403);
      const body = await response.json();
      expect(body.error.code).toBe("FORBIDDEN");
      expect([...store.customers.values()].some((c) => c.name === "Cliente Malicioso")).toBe(false);
    });

    it("accepts a matching Origin header", async () => {
      await signIn();

      const response = await listPost(
        new Request("http://localhost:3000/api/customers", {
          method: "POST",
          headers: { "content-type": "application/json", origin: "http://localhost:3000" },
          body: JSON.stringify({ name: "Cliente Valido" }),
        }),
      );

      expect(response.status).toBe(201);
    });
  });
});

describe("GET /api/customers/{id}", () => {
  beforeEach(() => {
    resetStore();
    mockCookieJar.clear();
  });

  it("rejects unauthenticated requests with 401 UNAUTHENTICATED", async () => {
    const response = await detailGet(
      new Request("http://localhost:3000/api/customers/x"),
      buildContext("40000000-0000-4000-8000-000000000001"),
    );

    expect(response.status).toBe(401);
  });

  it("returns the financial summary for an own-business customer", async () => {
    await signIn();

    const response = await detailGet(
      new Request("http://localhost:3000/api/customers/x"),
      buildContext("40000000-0000-4000-8000-000000000001"),
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.id).toBe("40000000-0000-4000-8000-000000000001");
    expect(typeof body.data.totalInvoiced).toBe("number");
    expect(typeof body.data.totalPaid).toBe("number");
    expect(typeof body.data.balance).toBe("number");
    expect(Array.isArray(body.data.recentInvoices)).toBe(true);
    expect(Array.isArray(body.data.recentPayments)).toBe(true);
  });

  it("returns 404 NOT_FOUND (not the record) for a customer belonging to a different business", async () => {
    await signIn();
    const otherCustomer = seedOtherBusinessCustomer();

    const response = await detailGet(
      new Request("http://localhost:3000/api/customers/x"),
      buildContext(otherCustomer.id),
    );

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error.code).toBe("NOT_FOUND");
    expect(JSON.stringify(body)).not.toContain("Cliente De Otro Negocio");
  });
});

describe("PATCH /api/customers/{id}", () => {
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
    const response = await detailPatch(
      new Request("http://localhost:3000/api/customers/x", {
        method: "PATCH",
        headers: { "content-type": "application/json", origin: "http://localhost:3000" },
        body: JSON.stringify({ phone: "3009999999" }),
      }),
      buildContext("40000000-0000-4000-8000-000000000001"),
    );

    expect(response.status).toBe(401);
  });

  it("applies a valid descriptive update to an own-business customer", async () => {
    await signIn();

    const response = await detailPatch(
      new Request("http://localhost:3000/api/customers/x", {
        method: "PATCH",
        headers: { "content-type": "application/json", origin: "http://localhost:3000" },
        body: JSON.stringify({ phone: "3009999999", isActive: false }),
      }),
      buildContext("40000000-0000-4000-8000-000000000001"),
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.phone).toBe("3009999999");
    expect(body.data.isActive).toBe(false);
  });

  it("rejects (via strict schema) a forged business_id/balance field with 400 VALIDATION_ERROR, applying no change", async () => {
    await signIn();

    const response = await detailPatch(
      new Request("http://localhost:3000/api/customers/x", {
        method: "PATCH",
        headers: { "content-type": "application/json", origin: "http://localhost:3000" },
        body: JSON.stringify({ business_id: "hacked", balance: 999999 }),
      }),
      buildContext("40000000-0000-4000-8000-000000000001"),
    );

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  it("returns 404 NOT_FOUND for a customer belonging to a different business (never applies the update)", async () => {
    await signIn();
    const otherCustomer = seedOtherBusinessCustomer();

    const response = await detailPatch(
      new Request("http://localhost:3000/api/customers/x", {
        method: "PATCH",
        headers: { "content-type": "application/json", origin: "http://localhost:3000" },
        body: JSON.stringify({ phone: "3000000000" }),
      }),
      buildContext(otherCustomer.id),
    );

    expect(response.status).toBe(404);
    expect(store.customers.get(otherCustomer.id)?.phone).toBeNull();
  });
});
