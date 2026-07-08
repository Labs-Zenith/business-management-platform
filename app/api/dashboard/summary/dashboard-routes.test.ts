import { beforeEach, describe, expect, it, vi } from "vitest";
import { resetStore } from "@/lib/mock/store";
import { repositories } from "@/lib/services/repositories";

/**
 * Same in-memory cookie jar strategy as `app/api/customers/customers-routes.test.ts`
 * / `app/api/auth/auth-routes.test.ts`: `next/headers`'s `cookies()` only
 * works inside a real Next.js request context, so this mocks the primitive
 * with a stateful jar shared across a single test — this exercises the REAL
 * `authAdapter` -> `session.ts` -> route handler code path, only faking the
 * underlying cookie storage.
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

function newBusinessId(): string {
  return crypto.randomUUID();
}

describe("GET /api/dashboard/summary", () => {
  beforeEach(() => {
    resetStore();
    mockCookieJar.clear();
  });

  it("rejects unauthenticated requests with 401 UNAUTHENTICATED", async () => {
    const response = await GET();

    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.error.code).toBe("UNAUTHENTICATED");
  });

  it("returns all 5 KPIs, Cache-Control: no-store, scoped to the session's own business", async () => {
    await signIn();

    const response = await GET();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const body = await response.json();
    expect(typeof body.data.pendingBalance).toBe("number");
    expect(typeof body.data.paidThisMonth).toBe("number");
    expect(typeof body.data.overdueInvoices).toBe("number");
    expect(Array.isArray(body.data.overdueInvoiceList)).toBe(true);
    expect(Array.isArray(body.data.recentPayments)).toBe(true);
    expect(Array.isArray(body.data.topDebtors)).toBe(true);
  });

  it("never leaks another business's data into the demo session's summary", async () => {
    await signIn();

    // Seed a much larger, unrelated business directly in the store.
    const otherBusinessId = newBusinessId();
    const otherCustomer = await repositories.customers.create(otherBusinessId, { name: "Cliente De Otro Negocio" });
    await repositories.invoices.create(otherBusinessId, {
      customerId: otherCustomer.id,
      issueDate: "2020-01-01",
      dueDate: "2020-01-15",
      items: [{ description: "Item grande", quantity: 1, unitPrice: 999_999_999, lineTotal: 999_999_999 }],
      subtotal: 999_999_999,
      total: 999_999_999,
      status: "pending",
      notes: null,
    });

    const response = await GET();
    const body = await response.json();

    expect(body.data.pendingBalance).not.toBe(999_999_999);
    expect(JSON.stringify(body)).not.toContain("Cliente De Otro Negocio");
    expect(
      body.data.overdueInvoiceList.every((invoice: { customerId: string }) => invoice.customerId !== otherCustomer.id),
    ).toBe(true);
  });
});
