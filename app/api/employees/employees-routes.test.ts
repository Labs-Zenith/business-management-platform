import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetStore, store } from "@/lib/mock/store";
import { repositories } from "@/lib/services/repositories";
import { employeeFixtures } from "@/lib/mock/fixtures/data";
import type { Employee } from "@/lib/services/ports";

/**
 * Same in-memory cookie jar strategy as `app/api/customers/customers-routes.test.ts`:
 * `next/headers`'s `cookies()` only works inside a real Next.js request
 * context, so this mocks the primitive with a stateful jar shared across a
 * single test — exercises the REAL `authAdapter` -> `session.ts` ->
 * route handler -> `employee-service.ts` -> `employee-repo.ts` code path.
 *
 * This is the app's FIRST role-gated route surface
 * (`openspec/changes/nomina-payroll/specs/role-based-navigation/spec.md`'s
 * "Worker calls a gated API route directly" scenario), so every test group
 * below proves BOTH the worker-403 path and the admin-success path — never
 * only the happy path.
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
const { PATCH: detailPatch } = await import("./[id]/route");

const BUSINESS_ID = "10000000-0000-4000-8000-000000000001";
const DEMO_EMAIL = "demo@negociodemo.test";
const DEMO_PASSWORD = "demo1234";
const EXISTING_EMPLOYEE_ID = employeeFixtures[0]!.id;

function buildContext(id: string) {
  return { params: Promise.resolve({ id }) };
}

/** Signs in as the seeded demo admin. */
async function signInAsAdmin(): Promise<void> {
  const session = await repositories.auth.signIn(DEMO_EMAIL, DEMO_PASSWORD);
  if (!session) {
    throw new Error("Test setup failed: demo sign-in did not succeed.");
  }
}

/**
 * Signs in as the demo user, then re-issues the session cookie with role
 * `"worker"` in the SAME business — `switchBusiness` performs no membership
 * verification of its own (see `lib/mock/auth-adapter.ts`'s security
 * contract JSDoc and `auth-adapter.test.ts`'s own "arbitrary role" test),
 * which is exactly what's needed here since no worker fixture is seeded:
 * this produces a real worker `Session` that flows through the REAL
 * `requireCapability` -> `permissions.can()` check, unmocked.
 */
async function signInAsWorker(): Promise<void> {
  await signInAsAdmin();
  const switched = await repositories.auth.switchBusiness(BUSINESS_ID, "worker");
  if (!switched) {
    throw new Error("Test setup failed: switchBusiness to worker did not succeed.");
  }
}

const ORIGINAL_APP_ORIGIN = process.env.APP_ORIGIN;

describe("GET /api/employees", () => {
  beforeEach(() => {
    resetStore();
    mockCookieJar.clear();
  });

  it("rejects unauthenticated requests with 401 UNAUTHENTICATED", async () => {
    const response = await listGet(new Request("http://localhost:3000/api/employees"));

    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.error.code).toBe("UNAUTHENTICATED");
  });

  it("rejects a worker session with 403 FORBIDDEN (lacks viewPayroll) before touching the store", async () => {
    await signInAsWorker();

    const response = await listGet(new Request("http://localhost:3000/api/employees"));

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error.code).toBe("FORBIDDEN");
  });

  it("returns the session business's employees, paginated, for an admin session", async () => {
    await signInAsAdmin();

    const response = await listGet(new Request("http://localhost:3000/api/employees?page=1&pageSize=10"));

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const body = await response.json();
    expect(body.data.length).toBe(employeeFixtures.length);
    expect(body.data.some((e: Employee) => e.id === EXISTING_EMPLOYEE_ID)).toBe(true);
  });

  it("filters by status=active, excluding the seeded inactive employee", async () => {
    await signInAsAdmin();

    const response = await listGet(new Request("http://localhost:3000/api/employees?status=active"));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.every((e: Employee) => e.active)).toBe(true);
    expect(body.data.some((e: Employee) => e.id === employeeFixtures.find((f) => !f.active)!.id)).toBe(false);
  });
});

describe("POST /api/employees", () => {
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
    return new Request("http://localhost:3000/api/employees", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "http://localhost:3000", ...headers },
      body: JSON.stringify(body),
    });
  }

  it("rejects unauthenticated requests with 401 UNAUTHENTICATED", async () => {
    const response = await listPost(postRequest({ name: "Nuevo Empleado", baseSalary: 1500000 }));

    expect(response.status).toBe(401);
  });

  it("rejects a worker session with 403 FORBIDDEN, creating nothing", async () => {
    await signInAsWorker();
    const countBefore = store.employees.size;

    const response = await listPost(postRequest({ name: "Nuevo Empleado", baseSalary: 1500000 }));

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error.code).toBe("FORBIDDEN");
    expect(store.employees.size).toBe(countBefore);
  });

  it("creates an employee under the admin session's business, active by default", async () => {
    await signInAsAdmin();

    const response = await listPost(postRequest({ name: "Nuevo Empleado", baseSalary: 1500000 }));

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.data.name).toBe("Nuevo Empleado");
    expect(body.data.baseSalary).toBe(1500000);
    expect(body.data.active).toBe(true);
    expect(body.data.businessId).toBe(BUSINESS_ID);
  });

  it("rejects (via strict schema) a forged business_id/active field with 400 VALIDATION_ERROR, creating nothing", async () => {
    await signInAsAdmin();
    const countBefore = store.employees.size;

    const response = await listPost(
      postRequest({ name: "Empleado Forjado", baseSalary: 1500000, business_id: "hacked", active: false }),
    );

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(store.employees.size).toBe(countBefore);
  });

  it("rejects a mismatched Origin header with 403 FORBIDDEN for an admin session too", async () => {
    await signInAsAdmin();

    const response = await listPost(
      postRequest({ name: "Empleado Malicioso", baseSalary: 1500000 }, { origin: "http://evil.test" }),
    );

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error.code).toBe("FORBIDDEN");
  });
});

describe("PATCH /api/employees/{id}", () => {
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

  function patchRequest(body: unknown) {
    return new Request(`http://localhost:3000/api/employees/${EXISTING_EMPLOYEE_ID}`, {
      method: "PATCH",
      headers: { "content-type": "application/json", origin: "http://localhost:3000" },
      body: JSON.stringify(body),
    });
  }

  it("rejects unauthenticated requests with 401 UNAUTHENTICATED", async () => {
    const response = await detailPatch(patchRequest({ baseSalary: 2100000 }), buildContext(EXISTING_EMPLOYEE_ID));

    expect(response.status).toBe(401);
  });

  it("rejects a worker session with 403 FORBIDDEN, applying no change", async () => {
    await signInAsWorker();

    const response = await detailPatch(patchRequest({ baseSalary: 2100000 }), buildContext(EXISTING_EMPLOYEE_ID));

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error.code).toBe("FORBIDDEN");
    expect(store.employees.get(EXISTING_EMPLOYEE_ID)?.baseSalary).toBe(employeeFixtures[0]!.baseSalary);
  });

  it("applies a valid update (baseSalary, active) for an admin session", async () => {
    await signInAsAdmin();

    const response = await detailPatch(
      patchRequest({ baseSalary: 2100000, active: false }),
      buildContext(EXISTING_EMPLOYEE_ID),
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.baseSalary).toBe(2100000);
    expect(body.data.active).toBe(false);
  });

  it("returns 404 NOT_FOUND for an unknown employee id (admin session)", async () => {
    await signInAsAdmin();

    const response = await detailPatch(
      patchRequest({ baseSalary: 2100000 }),
      buildContext("70000000-0000-4000-8000-999999999999"),
    );

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error.code).toBe("NOT_FOUND");
  });
});
