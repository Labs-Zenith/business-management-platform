import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetStore, store } from "@/lib/mock/store";
import { repositories } from "@/lib/services/repositories";
import type { Invoice } from "@/lib/services/ports";

/**
 * Same in-memory cookie jar strategy as
 * `app/api/invoices/invoices-routes.test.ts` — exercises the REAL
 * `authAdapter` -> `session.ts` -> route handler -> `payment-service.ts` ->
 * `lib/mock/payment-repo.ts` code path, only faking the underlying cookie
 * storage primitive.
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

const { POST } = await import("./route");

const BUSINESS_ID = "10000000-0000-4000-8000-000000000001";
const OTHER_BUSINESS_ID = "10000000-0000-4000-8000-000000000099";
const DEMO_EMAIL = "demo@negociodemo.test";
const DEMO_PASSWORD = "demo1234";
const CUSTOMER_ID = "40000000-0000-4000-8000-000000000001";

function buildContext(id: string) {
  return { params: Promise.resolve({ id }) };
}

async function signIn(): Promise<void> {
  const session = await repositories.auth.signIn(DEMO_EMAIL, DEMO_PASSWORD);
  if (!session) {
    throw new Error("Test setup failed: demo sign-in did not succeed.");
  }
}

/** Seeds an invoice with a known total directly under `BUSINESS_ID`, no payments. */
function seedInvoice(id: string, total: number, dueDate = "2026-08-01", status: Invoice["status"] = "pending"): Invoice {
  const invoice: Invoice = {
    id,
    businessId: BUSINESS_ID,
    customerId: CUSTOMER_ID,
    invoiceTypeId: "c1000000-0000-4000-8000-000000000001",
    number: `FAC-TEST-${id.slice(-4)}`,
    issueDate: "2026-07-01",
    dueDate,
    subtotal: total,
    total,
    status,
    notes: null,
    createdAt: "2024-01-01T00:00:00.000Z",
    updatedAt: "2024-01-01T00:00:00.000Z",
  };
  store.invoices.set(invoice.id, invoice);
  return invoice;
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
    invoiceTypeId: "c1000000-0000-4000-8000-000000000001",
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

const ORIGINAL_APP_ORIGIN = process.env.APP_ORIGIN;

function postRequest(id: string, body: unknown, headers: Record<string, string> = {}) {
  return new Request(`http://localhost:3000/api/invoices/${id}/payments`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: "http://localhost:3000", ...headers },
    body: JSON.stringify(body),
  });
}

describe("POST /api/invoices/{id}/payments", () => {
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
    const invoice = seedInvoice("50000000-0000-4000-8000-000000000901", 200000);

    const response = await POST(
      postRequest(invoice.id, { paymentDate: "2026-07-08", amount: 100000 }),
      buildContext(invoice.id),
    );

    expect(response.status).toBe(401);
  });

  it("registers a valid partial payment, deriving customerId from the invoice and recomputing status", async () => {
    await signIn();
    const invoice = seedInvoice("50000000-0000-4000-8000-000000000902", 200000);

    const response = await POST(
      postRequest(invoice.id, { paymentDate: "2026-07-08", amount: 80000, method: "cash" }),
      buildContext(invoice.id),
    );

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.data.balance).toBe(120000);
    expect(body.data.status).toBe("partially_paid");
    expect(body.data.payments).toHaveLength(1);
    expect(body.data.payments[0].customerId).toBe(CUSTOMER_ID);
  });

  it("registers a partial payment on an overdue invoice and returns partially_paid, not overdue", async () => {
    await signIn();
    const invoice = seedInvoice("50000000-0000-4000-8000-000000000912", 200000, "2020-01-01", "overdue");

    const response = await POST(
      postRequest(invoice.id, { paymentDate: "2026-07-08", amount: 80000, method: "cash" }),
      buildContext(invoice.id),
    );

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.data.balance).toBe(120000);
    expect(body.data.status).toBe("partially_paid");
    expect(store.invoices.get(invoice.id)!.status).toBe("partially_paid");
  });

  it("rejects an overpay attempt (not 500) and leaves the store completely unchanged", async () => {
    await signIn();
    const invoice = seedInvoice("50000000-0000-4000-8000-000000000903", 200000);
    const paymentCountBefore = store.payments.size;

    const response = await POST(
      postRequest(invoice.id, { paymentDate: "2026-07-08", amount: 250000 }),
      buildContext(invoice.id),
    );

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(store.payments.size).toBe(paymentCountBefore);
    const unchanged = store.invoices.get(invoice.id);
    expect(unchanged!.status).toBe("pending");
  });

  it("rejects a payment on an already-fully-paid invoice (balance == 0)", async () => {
    await signIn();
    const invoice = seedInvoice("50000000-0000-4000-8000-000000000904", 100000);
    await POST(postRequest(invoice.id, { paymentDate: "2026-07-08", amount: 100000 }), buildContext(invoice.id));

    const response = await POST(
      postRequest(invoice.id, { paymentDate: "2026-07-09", amount: 1 }),
      buildContext(invoice.id),
    );

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  it("the response never contains a client-supplied customerId, even when one is forged in the request body", async () => {
    await signIn();
    const invoice = seedInvoice("50000000-0000-4000-8000-000000000905", 200000);
    const paymentCountBefore = store.payments.size;

    const response = await POST(
      postRequest(invoice.id, {
        paymentDate: "2026-07-08",
        amount: 80000,
        customerId: "40000000-0000-4000-8000-000000000999",
      }),
      buildContext(invoice.id),
    );

    // The strict schema rejects the unknown `customerId` field outright.
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(JSON.stringify(body)).not.toContain("40000000-0000-4000-8000-000000000999");
    expect(store.payments.size).toBe(paymentCountBefore);
  });

  it("rejects a client-supplied business_id/status/balance via the strict schema, creating nothing", async () => {
    await signIn();
    const invoice = seedInvoice("50000000-0000-4000-8000-000000000906", 200000);
    const paymentCountBefore = store.payments.size;

    const response = await POST(
      postRequest(invoice.id, {
        paymentDate: "2026-07-08",
        amount: 80000,
        business_id: OTHER_BUSINESS_ID,
        status: "paid",
        balance: 0,
      }),
      buildContext(invoice.id),
    );

    expect(response.status).toBe(400);
    expect(store.payments.size).toBe(paymentCountBefore);
  });

  it("returns 404 NOT_FOUND (not the record) for an invoice belonging to a different business, creating no payment", async () => {
    await signIn();
    const otherInvoice = seedOtherBusinessInvoice();
    const paymentCountBefore = store.payments.size;

    const response = await POST(
      postRequest(otherInvoice.id, { paymentDate: "2026-07-08", amount: 10000 }),
      buildContext(otherInvoice.id),
    );

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error.code).toBe("NOT_FOUND");
    expect(store.payments.size).toBe(paymentCountBefore);
  });

  it("rejects a mismatched Origin header with 403 FORBIDDEN before touching the store", async () => {
    await signIn();
    const invoice = seedInvoice("50000000-0000-4000-8000-000000000907", 200000);
    const paymentCountBefore = store.payments.size;

    const response = await POST(
      postRequest(invoice.id, { paymentDate: "2026-07-08", amount: 10000 }, { origin: "http://evil.test" }),
      buildContext(invoice.id),
    );

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error.code).toBe("FORBIDDEN");
    expect(store.payments.size).toBe(paymentCountBefore);
  });
});
