import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetStore, store } from "@/lib/mock/store";
import { repositories } from "@/lib/services/repositories";
import { employeeFixtures, payrollPaymentFixtures } from "@/lib/mock/fixtures/data";

/**
 * Same in-memory cookie jar strategy as
 * `app/api/employees/employees-routes.test.ts` — exercises the REAL
 * `authAdapter` -> `session.ts` -> route handler -> `payroll-service.ts` ->
 * `payroll-repo.ts` code path (including the atomic payment->expense
 * transaction), only faking the underlying cookie storage.
 *
 * Every group below proves BOTH the worker-403 path and the admin-success
 * path, per
 * `openspec/changes/nomina-payroll/specs/role-permissions/spec.md`'s
 * "Worker denied at a payroll API route" / "Admin granted access" scenarios.
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
const DEMO_EMAIL = "demo@negociodemo.test";
const DEMO_PASSWORD = "demo1234";
const ACTIVE_EMPLOYEE_ID = employeeFixtures.find((employee) => employee.active)!.id;

async function signInAsAdmin(): Promise<void> {
  const session = await repositories.auth.signIn(DEMO_EMAIL, DEMO_PASSWORD);
  if (!session) {
    throw new Error("Test setup failed: demo sign-in did not succeed.");
  }
}

/** See `employees-routes.test.ts`'s identical helper for the full rationale. */
async function signInAsWorker(): Promise<void> {
  await signInAsAdmin();
  const switched = await repositories.auth.switchBusiness(BUSINESS_ID, "worker");
  if (!switched) {
    throw new Error("Test setup failed: switchBusiness to worker did not succeed.");
  }
}

const ORIGINAL_APP_ORIGIN = process.env.APP_ORIGIN;

describe("GET /api/payroll-payments", () => {
  beforeEach(() => {
    resetStore();
    mockCookieJar.clear();
  });

  it("rejects unauthenticated requests with 401 UNAUTHENTICATED", async () => {
    const response = await listGet(new Request("http://localhost:3000/api/payroll-payments"));

    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.error.code).toBe("UNAUTHENTICATED");
  });

  it("rejects a worker session with 403 FORBIDDEN (lacks viewPayroll)", async () => {
    await signInAsWorker();

    const response = await listGet(new Request("http://localhost:3000/api/payroll-payments"));

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error.code).toBe("FORBIDDEN");
  });

  it("returns the session business's payroll payments, with employee names attached, for an admin session", async () => {
    await signInAsAdmin();

    const response = await listGet(
      new Request("http://localhost:3000/api/payroll-payments?page=1&pageSize=50"),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const body = await response.json();
    expect(body.data.length).toBe(payrollPaymentFixtures.length);
    expect(body.data.every((p: { employee: { name: string } }) => typeof p.employee.name === "string")).toBe(true);
  });

  it("filters by employeeId", async () => {
    await signInAsAdmin();

    const response = await listGet(
      new Request(`http://localhost:3000/api/payroll-payments?employeeId=${ACTIVE_EMPLOYEE_ID}&pageSize=50`),
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.length).toBeGreaterThan(0);
    expect(body.data.every((p: { employeeId: string }) => p.employeeId === ACTIVE_EMPLOYEE_ID)).toBe(true);
  });
});

describe("POST /api/payroll-payments", () => {
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
    return new Request("http://localhost:3000/api/payroll-payments", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "http://localhost:3000", ...headers },
      body: JSON.stringify(body),
    });
  }

  const VALID_PAYLOAD = {
    employeeId: ACTIVE_EMPLOYEE_ID,
    amount: 1000000,
    periodType: "quincenal" as const,
    referenceDate: "2026-07-05",
    paymentDate: "2026-07-05",
  };

  it("rejects unauthenticated requests with 401 UNAUTHENTICATED", async () => {
    const response = await listPost(postRequest(VALID_PAYLOAD));

    expect(response.status).toBe(401);
  });

  it("rejects a worker session with 403 FORBIDDEN, creating neither the payment nor its linked expense", async () => {
    await signInAsWorker();
    const paymentsBefore = store.payrollPayments.size;
    const expensesBefore = store.expenses.size;

    const response = await listPost(postRequest(VALID_PAYLOAD));

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error.code).toBe("FORBIDDEN");
    expect(store.payrollPayments.size).toBe(paymentsBefore);
    expect(store.expenses.size).toBe(expensesBefore);
  });

  it("creates a payroll payment AND its linked category:'nomina' expense atomically for an admin session", async () => {
    await signInAsAdmin();
    const expensesBefore = store.expenses.size;

    const response = await listPost(postRequest(VALID_PAYLOAD));

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.data.employeeId).toBe(ACTIVE_EMPLOYEE_ID);
    expect(body.data.amount).toBe(1000000);
    expect(body.data.periodStart).toBe("2026-07-01");
    expect(body.data.periodEnd).toBe("2026-07-15");
    expect(store.expenses.size).toBe(expensesBefore + 1);
    expect([...store.expenses.values()].some((e) => e.category === "nomina" && e.amount === 1000000)).toBe(true);
  });

  it("rejects an unknown employeeId with 404 NOT_FOUND for an admin session, creating nothing", async () => {
    await signInAsAdmin();
    const paymentsBefore = store.payrollPayments.size;

    const response = await listPost(
      postRequest({ ...VALID_PAYLOAD, employeeId: "70000000-0000-4000-8000-999999999999" }),
    );

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error.code).toBe("NOT_FOUND");
    expect(store.payrollPayments.size).toBe(paymentsBefore);
  });

  it("rejects a zero/negative amount with 400 VALIDATION_ERROR for an admin session", async () => {
    await signInAsAdmin();

    const response = await listPost(postRequest({ ...VALID_PAYLOAD, amount: 0 }));

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  it("rejects (via strict schema) a forged periodStart with 400 VALIDATION_ERROR, creating nothing", async () => {
    await signInAsAdmin();
    const paymentsBefore = store.payrollPayments.size;

    const response = await listPost(postRequest({ ...VALID_PAYLOAD, periodStart: "2026-01-01" }));

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(store.payrollPayments.size).toBe(paymentsBefore);
  });
});
