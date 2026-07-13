import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetStore, store } from "@/lib/mock/store";
import { repositories } from "@/lib/services/repositories";
import type { Invoice } from "@/lib/services/ports";

/**
 * Same in-memory cookie jar strategy as `app/api/customers/customers-routes.test.ts`:
 * `next/headers`'s `cookies()` only works inside a real Next.js request
 * context, so this mocks the primitive with a stateful jar shared across a
 * single test — this exercises the REAL `authAdapter` -> `session.ts` ->
 * route handler -> `invoice-service.ts` -> `invoice-repo.ts` code path, only
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

const { GET: listGet, POST: listPost } = await import("./route");
const { GET: detailGet, PATCH: detailPatch } = await import("./[id]/route");

const BUSINESS_ID = "10000000-0000-4000-8000-000000000001";
const OTHER_BUSINESS_ID = "10000000-0000-4000-8000-000000000099";
const DEMO_EMAIL = "demo@negociodemo.test";
const DEMO_PASSWORD = "demo1234";
const CUSTOMER_ID = "40000000-0000-4000-8000-000000000001";
// Seeded zero-payment invoice (pending, no payments) — safe to edit.
const ZERO_PAYMENT_INVOICE_ID = "50000000-0000-4000-8000-000000000001";
// Seeded invoice with an existing payment (partially_paid) — edit-locked.
const PAID_INVOICE_ID = "50000000-0000-4000-8000-000000000007";

function buildContext(id: string) {
  return { params: Promise.resolve({ id }) };
}

async function signIn(): Promise<void> {
  const session = await repositories.auth.signIn(DEMO_EMAIL, DEMO_PASSWORD);
  if (!session) {
    throw new Error("Test setup failed: demo sign-in did not succeed.");
  }
}

/**
 * Signs in as the demo user, then re-issues the session cookie with role
 * `"worker"` in the SAME business (mirrors
 * `app/api/employees/employees-routes.test.ts`'s helper) — used to prove
 * `PATCH /api/invoices/{id}` has NO capability gate (unlike
 * `PATCH /api/employees/{id}`'s `viewPayroll` gate): any authenticated
 * session, admin or worker, may edit an invoice.
 */
async function signInAsWorker(): Promise<void> {
  await signIn();
  const switched = await repositories.auth.switchBusiness(BUSINESS_ID, "worker");
  if (!switched) {
    throw new Error("Test setup failed: switchBusiness to worker did not succeed.");
  }
}

/** Seeds a customer + invoice under a DIFFERENT business, directly in the mock store. */
function seedOtherBusinessInvoice(): Invoice {
  const otherCustomerId = "40000000-0000-4000-8000-000000000998";
  store.customers.set(otherCustomerId, {
    id: otherCustomerId,
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
  });

  const invoice: Invoice = {
    id: "50000000-0000-4000-8000-000000000998",
    businessId: OTHER_BUSINESS_ID,
    customerId: otherCustomerId,
    number: "FAC-OTHER-0001",
    issueDate: "2026-01-01",
    dueDate: null,
    subtotal: 100000,
    total: 100000,
    status: "pending",
    notes: "Factura de otro negocio",
    createdAt: "2024-01-01T00:00:00.000Z",
    updatedAt: "2024-01-01T00:00:00.000Z",
  };
  store.invoices.set(invoice.id, invoice);
  return invoice;
}

/** Seeds an invoice directly under BUSINESS_ID with a persisted `status` that is deliberately stale. */
function seedStaleStatusInvoice(): Invoice {
  const invoice: Invoice = {
    id: "50000000-0000-4000-8000-000000000997",
    businessId: BUSINESS_ID,
    customerId: CUSTOMER_ID,
    number: "FAC-STALE-0001",
    issueDate: "2020-01-01",
    dueDate: "2020-02-01", // long past due, balance > 0, no payments -> should compute "overdue"
    subtotal: 100000,
    total: 100000,
    status: "pending", // deliberately stale/wrong persisted value
    notes: null,
    createdAt: "2020-01-01T00:00:00.000Z",
    updatedAt: "2020-01-01T00:00:00.000Z",
  };
  store.invoices.set(invoice.id, invoice);
  return invoice;
}

const ORIGINAL_APP_ORIGIN = process.env.APP_ORIGIN;

describe("GET /api/invoices", () => {
  beforeEach(() => {
    resetStore();
    mockCookieJar.clear();
  });

  it("rejects unauthenticated requests with 401 UNAUTHENTICATED", async () => {
    const response = await listGet(new Request("http://localhost:3000/api/invoices"));

    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.error.code).toBe("UNAUTHENTICATED");
  });

  it("returns only the session business's invoices, paginated, with Cache-Control: no-store", async () => {
    await signIn();
    const otherInvoice = seedOtherBusinessInvoice();

    const response = await listGet(new Request("http://localhost:3000/api/invoices?page=1&pageSize=5"));

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const body = await response.json();
    expect(body.data.length).toBeLessThanOrEqual(5);
    expect(body.data.every((invoice: { id: string }) => invoice.id !== otherInvoice.id)).toBe(true);
  });

  it("filters by status", async () => {
    await signIn();

    const response = await listGet(new Request("http://localhost:3000/api/invoices?status=overdue&pageSize=50"));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.every((invoice: { status: string }) => invoice.status === "overdue")).toBe(true);
  });

  it("rejects an invalid status query parameter with 400 VALIDATION_ERROR", async () => {
    await signIn();

    const response = await listGet(new Request("http://localhost:3000/api/invoices?status=bogus"));

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });
});

describe("POST /api/invoices", () => {
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
    return new Request("http://localhost:3000/api/invoices", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "http://localhost:3000", ...headers },
      body: JSON.stringify(body),
    });
  }

  it("rejects unauthenticated requests with 401 UNAUTHENTICATED", async () => {
    const response = await listPost(
      postRequest({
        customerId: CUSTOMER_ID,
        issueDate: "2026-07-06",
        items: [{ description: "Servicio", quantity: 1, unitPrice: 100000 }],
      }),
    );

    expect(response.status).toBe(401);
  });

  it("creates an invoice with server-computed number/subtotal/total/status", async () => {
    await signIn();

    const response = await listPost(
      postRequest({
        customerId: CUSTOMER_ID,
        issueDate: "2026-07-06",
        dueDate: "2026-08-06",
        items: [{ description: "Servicio de estetica", quantity: 2, unitPrice: 500000 }],
      }),
    );

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.data.total).toBe(1000000);
    expect(body.data.subtotal).toBe(1000000);
    expect(body.data.status).toBe("pending");
    expect(body.data.businessId).toBe(BUSINESS_ID);
    expect(typeof body.data.number).toBe("string");
    expect(body.data.items).toHaveLength(1);
    expect(body.data.items[0].lineTotal).toBe(1000000);
  });

  it("provably discards forged number/status/subtotal/total/business_id — request is rejected 400 VALIDATION_ERROR (strict schema) and NOTHING is persisted", async () => {
    await signIn();

    const response = await listPost(
      postRequest({
        customerId: CUSTOMER_ID,
        issueDate: "2026-07-06",
        items: [{ description: "Servicio", quantity: 1, unitPrice: 100000 }],
        number: "FAC-FORGED",
        status: "paid",
        subtotal: 999999,
        total: 999999,
        business_id: OTHER_BUSINESS_ID,
      }),
    );

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
    // Nothing was silently created with the forged fields stripped either —
    // the whole request is rejected, no invoice row exists anywhere.
    const created = [...store.invoices.values()].filter((invoice) => invoice.number === "FAC-FORGED");
    expect(created).toHaveLength(0);
    const createdUnderForgedTotal = [...store.invoices.values()].filter((invoice) => invoice.total === 999999);
    expect(createdUnderForgedTotal).toHaveLength(0);
  });

  it("aborts the WHOLE request with 400 VALIDATION_ERROR when any item is invalid (quantity <= 0) — creates nothing", async () => {
    await signIn();
    const invoiceCountBefore = store.invoices.size;

    const response = await listPost(
      postRequest({
        customerId: CUSTOMER_ID,
        issueDate: "2026-07-06",
        items: [
          { description: "Item valido", quantity: 1, unitPrice: 100000 },
          { description: "Item invalido", quantity: 0, unitPrice: 100000 },
        ],
      }),
    );

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(store.invoices.size).toBe(invoiceCountBefore);
  });

  it("rejects a customerId belonging to a different business with 404 NOT_FOUND, creating nothing", async () => {
    await signIn();
    const otherCustomerId = "40000000-0000-4000-8000-000000000998";
    store.customers.set(otherCustomerId, {
      id: otherCustomerId,
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
    });
    const invoiceCountBefore = store.invoices.size;

    const response = await listPost(
      postRequest({
        customerId: otherCustomerId,
        issueDate: "2026-07-06",
        items: [{ description: "Servicio", quantity: 1, unitPrice: 100000 }],
      }),
    );

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error.code).toBe("NOT_FOUND");
    expect(store.invoices.size).toBe(invoiceCountBefore);
  });

  it("rejects a mismatched Origin header with 403 FORBIDDEN before touching the store", async () => {
    await signIn();

    const response = await listPost(
      postRequest(
        {
          customerId: CUSTOMER_ID,
          issueDate: "2026-07-06",
          items: [{ description: "Servicio", quantity: 1, unitPrice: 100000 }],
        },
        { origin: "http://evil.test" },
      ),
    );

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error.code).toBe("FORBIDDEN");
  });
});

describe("GET /api/invoices/{id}", () => {
  beforeEach(() => {
    resetStore();
    mockCookieJar.clear();
  });

  it("rejects unauthenticated requests with 401 UNAUTHENTICATED", async () => {
    const response = await detailGet(
      new Request("http://localhost:3000/api/invoices/x"),
      buildContext("50000000-0000-4000-8000-000000000001"),
    );

    expect(response.status).toBe(401);
  });

  it("returns invoice detail with items, customer, payments, and computed total/balance/status", async () => {
    await signIn();

    const response = await detailGet(
      new Request("http://localhost:3000/api/invoices/x"),
      buildContext("50000000-0000-4000-8000-000000000001"),
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.id).toBe("50000000-0000-4000-8000-000000000001");
    expect(Array.isArray(body.data.items)).toBe(true);
    expect(Array.isArray(body.data.payments)).toBe(true);
    expect(typeof body.data.balance).toBe("number");
    expect(typeof body.data.status).toBe("string");
    expect(body.data.customer).toBeDefined();
  });

  it("always returns the recomputed status, even when the persisted status field is stale", async () => {
    await signIn();
    const stale = seedStaleStatusInvoice();
    expect(stale.status).toBe("pending"); // sanity: the seeded/persisted value is the stale one

    const response = await detailGet(
      new Request("http://localhost:3000/api/invoices/x"),
      buildContext(stale.id),
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    // Recomputed at read time: past-due, balance > 0, no payments -> overdue,
    // NOT the stale persisted "pending".
    expect(body.data.status).toBe("overdue");
  });

  it("returns 404 NOT_FOUND (not the record) for an invoice belonging to a different business", async () => {
    await signIn();
    const otherInvoice = seedOtherBusinessInvoice();

    const response = await detailGet(
      new Request("http://localhost:3000/api/invoices/x"),
      buildContext(otherInvoice.id),
    );

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error.code).toBe("NOT_FOUND");
    expect(JSON.stringify(body)).not.toContain("Cliente De Otro Negocio");
  });
});

/**
 * `PATCH /api/invoices/{id}`, per
 * `openspec/changes/audit-log/specs/invoices/spec.md`'s "Invoice Editing
 * Locked to Zero-Payment Invoices" requirement. Session-gated only — NO
 * capability gate (unlike `PATCH /api/employees/{id}`'s `viewPayroll` gate):
 * mirrors `app/api/products/[id]/route.ts`'s convention exactly.
 */
describe("PATCH /api/invoices/{id}", () => {
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

  const VALID_UPDATE = {
    customerId: CUSTOMER_ID,
    issueDate: "2026-07-09",
    dueDate: "2026-08-09",
    items: [{ description: "Servicio editado", quantity: 1, unitPrice: 350000 }],
    notes: "Editado via PATCH",
  };

  function patchRequest(id: string, body: unknown, headers: Record<string, string> = {}) {
    return new Request(`http://localhost:3000/api/invoices/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json", origin: "http://localhost:3000", ...headers },
      body: JSON.stringify(body),
    });
  }

  it("rejects unauthenticated requests with 401 UNAUTHENTICATED, applying no change", async () => {
    const before = store.invoices.get(ZERO_PAYMENT_INVOICE_ID);

    const response = await detailPatch(
      patchRequest(ZERO_PAYMENT_INVOICE_ID, VALID_UPDATE),
      buildContext(ZERO_PAYMENT_INVOICE_ID),
    );

    expect(response.status).toBe(401);
    expect(store.invoices.get(ZERO_PAYMENT_INVOICE_ID)).toEqual(before);
  });

  it("applies a valid update for an admin session on a zero-payment invoice, recomputing subtotal/total/status", async () => {
    await signIn();

    const response = await detailPatch(
      patchRequest(ZERO_PAYMENT_INVOICE_ID, VALID_UPDATE),
      buildContext(ZERO_PAYMENT_INVOICE_ID),
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.total).toBe(350000);
    expect(body.data.subtotal).toBe(350000);
    expect(body.data.notes).toBe("Editado via PATCH");
    expect(body.data.items).toHaveLength(1);
    expect(body.data.items[0].description).toBe("Servicio editado");
  });

  it("applies a valid update for a WORKER session too — NO capability gate on this route (unlike PATCH /api/employees/{id})", async () => {
    await signInAsWorker();

    const response = await detailPatch(
      patchRequest(ZERO_PAYMENT_INVOICE_ID, VALID_UPDATE),
      buildContext(ZERO_PAYMENT_INVOICE_ID),
    );

    expect(response.status).toBe(200);
  });

  it("rejects a paid invoice with 409 CONFLICT, a clean error (not a 500), applying ZERO mutation", async () => {
    await signIn();
    const before = { ...store.invoices.get(PAID_INVOICE_ID)! };
    const itemsBefore = [...store.invoiceItems.values()].filter((item) => item.invoiceId === PAID_INVOICE_ID);

    const response = await detailPatch(
      patchRequest(PAID_INVOICE_ID, VALID_UPDATE),
      buildContext(PAID_INVOICE_ID),
    );

    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body.error.code).toBe("CONFLICT");
    expect(store.invoices.get(PAID_INVOICE_ID)).toEqual(before);
    const itemsAfter = [...store.invoiceItems.values()].filter((item) => item.invoiceId === PAID_INVOICE_ID);
    expect(itemsAfter).toEqual(itemsBefore);
  });

  it("returns 404 NOT_FOUND for an invoice belonging to a different business, applying no change", async () => {
    await signIn();
    const otherInvoice = seedOtherBusinessInvoice();

    const response = await detailPatch(patchRequest(otherInvoice.id, VALID_UPDATE), buildContext(otherInvoice.id));

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error.code).toBe("NOT_FOUND");
  });

  it("rejects a mismatched Origin header with 403 FORBIDDEN, applying no change", async () => {
    await signIn();
    const before = store.invoices.get(ZERO_PAYMENT_INVOICE_ID);

    const response = await detailPatch(
      patchRequest(ZERO_PAYMENT_INVOICE_ID, VALID_UPDATE, { origin: "http://evil.test" }),
      buildContext(ZERO_PAYMENT_INVOICE_ID),
    );

    expect(response.status).toBe(403);
    expect(store.invoices.get(ZERO_PAYMENT_INVOICE_ID)).toEqual(before);
  });

  it("rejects (via strict schema) a forged number/status/subtotal/total/business_id field with 400 VALIDATION_ERROR, applying no change", async () => {
    await signIn();
    const before = store.invoices.get(ZERO_PAYMENT_INVOICE_ID);

    const response = await detailPatch(
      patchRequest(ZERO_PAYMENT_INVOICE_ID, {
        ...VALID_UPDATE,
        number: "FAC-FORGED",
        status: "paid",
        subtotal: 1,
        total: 1,
        business_id: OTHER_BUSINESS_ID,
      }),
      buildContext(ZERO_PAYMENT_INVOICE_ID),
    );

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(store.invoices.get(ZERO_PAYMENT_INVOICE_ID)).toEqual(before);
  });

  it("records an invoice_updated audit row after a successful PATCH", async () => {
    await signIn();

    const response = await detailPatch(
      patchRequest(ZERO_PAYMENT_INVOICE_ID, VALID_UPDATE),
      buildContext(ZERO_PAYMENT_INVOICE_ID),
    );

    expect(response.status).toBe(200);
    const entries = [...store.auditLogs.values()].filter(
      (entry) => entry.entityType === "invoice" && entry.entityId === ZERO_PAYMENT_INVOICE_ID,
    );
    expect(entries.some((entry) => entry.action === "invoice_updated")).toBe(true);
  });
});
