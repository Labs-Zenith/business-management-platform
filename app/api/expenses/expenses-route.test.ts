import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetStore, store } from "@/lib/mock/store";
import { repositories } from "@/lib/services/repositories";
import type { Expense } from "@/lib/services/ports";

/**
 * Same in-memory cookie jar strategy as
 * `app/api/invoices/invoices-routes.test.ts`: `next/headers`'s `cookies()`
 * only works inside a real Next.js request context, so this mocks the
 * primitive with a stateful jar shared across a single test — this exercises
 * the REAL `authAdapter` -> `session.ts` -> route handler ->
 * `expense-service.ts` -> `expense-repo.ts` code path, only faking the
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

const { GET: listGet, POST: listPost } = await import("./route");

const BUSINESS_ID = "10000000-0000-4000-8000-000000000001";
const OTHER_BUSINESS_ID = "10000000-0000-4000-8000-000000000099";
const DEMO_EMAIL = "demo@negociodemo.test";
const DEMO_PASSWORD = "demo1234";

async function signIn(): Promise<void> {
  const session = await repositories.auth.signIn(DEMO_EMAIL, DEMO_PASSWORD);
  if (!session) {
    throw new Error("Test setup failed: demo sign-in did not succeed.");
  }
}

/** Seeds an expense directly under a DIFFERENT business, straight into the mock store. */
function seedOtherBusinessExpense(): Expense {
  const expense: Expense = {
    id: "60000000-0000-4000-8000-000000000998",
    businessId: OTHER_BUSINESS_ID,
    category: "otro",
    expenseDate: "2026-07-01",
    description: "Gasto de otro negocio",
    amount: 999999,
    notes: null,
    createdAt: "2024-01-01T00:00:00.000Z",
    updatedAt: "2024-01-01T00:00:00.000Z",
  };
  store.expenses.set(expense.id, expense);
  return expense;
}

const ORIGINAL_APP_ORIGIN = process.env.APP_ORIGIN;

describe("GET /api/expenses", () => {
  beforeEach(() => {
    resetStore();
    mockCookieJar.clear();
  });

  it("rejects unauthenticated requests with 401 UNAUTHENTICATED", async () => {
    const response = await listGet(new Request("http://localhost:3000/api/expenses"));

    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.error.code).toBe("UNAUTHENTICATED");
  });

  it("returns only the session business's expenses, paginated, with Cache-Control: no-store", async () => {
    await signIn();
    const otherExpense = seedOtherBusinessExpense();

    const response = await listGet(new Request("http://localhost:3000/api/expenses?page=1&pageSize=5"));

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const body = await response.json();
    expect(body.data.length).toBeLessThanOrEqual(5);
    expect(body.data.every((expense: { id: string }) => expense.id !== otherExpense.id)).toBe(true);
  });

  it("filters by category and date range", async () => {
    await signIn();

    const response = await listGet(
      new Request("http://localhost:3000/api/expenses?category=nomina&from=2000-01-01&to=2100-01-01&pageSize=50"),
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.every((expense: { category: string }) => expense.category === "nomina")).toBe(true);
  });

  it("rejects an invalid category query parameter with 400 VALIDATION_ERROR", async () => {
    await signIn();

    const response = await listGet(new Request("http://localhost:3000/api/expenses?category=viajes"));

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  it("never leaks another business's expense even under a matching category/date filter", async () => {
    await signIn();
    const otherExpense = seedOtherBusinessExpense();

    const response = await listGet(
      new Request("http://localhost:3000/api/expenses?category=otro&from=2020-01-01&to=2030-01-01&pageSize=50"),
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.some((expense: { id: string }) => expense.id === otherExpense.id)).toBe(false);
  });
});

describe("POST /api/expenses", () => {
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

  function postRequest(body: unknown, headers: Record<string, string> = {}) {
    return new Request("http://localhost:3000/api/expenses", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "http://localhost:3000", ...headers },
      body: JSON.stringify(body),
    });
  }

  it("rejects unauthenticated requests with 401 UNAUTHENTICATED", async () => {
    const response = await listPost(
      postRequest({ category: "otro", expenseDate: "2026-07-08", description: "Papeleria", amount: 50000 }),
    );

    expect(response.status).toBe(401);
  });

  it("creates an expense under the session's business_id", async () => {
    await signIn();

    const response = await listPost(
      postRequest({ category: "nomina", expenseDate: "2026-07-08", description: "Nomina julio", amount: 2000000 }),
    );

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.data.category).toBe("nomina");
    expect(body.data.amount).toBe(2000000);
    expect(body.data.businessId).toBe(BUSINESS_ID);
    expect(typeof body.data.id).toBe("string");
  });

  it("provably discards a forged business_id — request is rejected 400 VALIDATION_ERROR (strict schema) and NOTHING is persisted", async () => {
    await signIn();
    const countBefore = store.expenses.size;

    const response = await listPost(
      postRequest({
        category: "otro",
        expenseDate: "2026-07-08",
        description: "Intento forjado",
        amount: 50000,
        business_id: OTHER_BUSINESS_ID,
      }),
    );

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(store.expenses.size).toBe(countBefore);
  });

  it("rejects an invalid category with 400 VALIDATION_ERROR, creating nothing", async () => {
    await signIn();
    const countBefore = store.expenses.size;

    const response = await listPost(
      postRequest({ category: "viajes", expenseDate: "2026-07-08", description: "Invalido", amount: 50000 }),
    );

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(store.expenses.size).toBe(countBefore);
  });

  it("rejects a zero/negative/non-integer amount with 400 VALIDATION_ERROR", async () => {
    await signIn();

    const zero = await listPost(
      postRequest({ category: "otro", expenseDate: "2026-07-08", description: "Cero", amount: 0 }),
    );
    expect(zero.status).toBe(400);

    const fractional = await listPost(
      postRequest({ category: "otro", expenseDate: "2026-07-08", description: "Fraccional", amount: 100.5 }),
    );
    expect(fractional.status).toBe(400);
  });

  it("rejects a mismatched Origin header with 403 FORBIDDEN before touching the store", async () => {
    await signIn();

    const response = await listPost(
      postRequest(
        { category: "otro", expenseDate: "2026-07-08", description: "Papeleria", amount: 50000 },
        { origin: "http://evil.test" },
      ),
    );

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error.code).toBe("FORBIDDEN");
  });
});
