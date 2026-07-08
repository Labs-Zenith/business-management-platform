import { beforeEach, describe, expect, it, vi } from "vitest";
import { resetStore, store } from "@/lib/mock/store";
import { repositories } from "@/lib/services/repositories";
import type { Invoice, Payment } from "@/lib/services/ports";

/**
 * Same in-memory cookie jar strategy as
 * `app/api/customers/customers-routes.test.ts` — exercises the REAL
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

const { GET } = await import("./route");

const OTHER_BUSINESS_ID = "10000000-0000-4000-8000-000000000099";
const DEMO_EMAIL = "demo@negociodemo.test";
const DEMO_PASSWORD = "demo1234";
const CUSTOMER_ID = "40000000-0000-4000-8000-000000000001";

async function signIn(): Promise<void> {
  const session = await repositories.auth.signIn(DEMO_EMAIL, DEMO_PASSWORD);
  if (!session) {
    throw new Error("Test setup failed: demo sign-in did not succeed.");
  }
}

/** Seeds an invoice + payment under a DIFFERENT business, directly in the mock store. */
function seedOtherBusinessPayment(): Payment {
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
    status: "partially_paid",
    notes: null,
    createdAt: "2024-01-01T00:00:00.000Z",
    updatedAt: "2024-01-01T00:00:00.000Z",
  };
  store.invoices.set(invoice.id, invoice);

  const payment: Payment = {
    id: "60000000-0000-4000-8000-000000000998",
    businessId: OTHER_BUSINESS_ID,
    invoiceId: invoice.id,
    customerId: otherCustomerId,
    paymentDate: "2026-01-02",
    amount: 50000,
    method: "cash",
    notes: null,
    createdAt: "2024-01-01T00:00:00.000Z",
    updatedAt: "2024-01-01T00:00:00.000Z",
  };
  store.payments.set(payment.id, payment);
  return payment;
}

describe("GET /api/payments", () => {
  beforeEach(() => {
    resetStore();
    mockCookieJar.clear();
  });

  it("rejects unauthenticated requests with 401 UNAUTHENTICATED", async () => {
    const response = await GET(new Request("http://localhost:3000/api/payments"));

    expect(response.status).toBe(401);
  });

  it("returns only the session business's payments, paginated, with Cache-Control: no-store", async () => {
    await signIn();
    const otherPayment = seedOtherBusinessPayment();

    const response = await GET(new Request("http://localhost:3000/api/payments?page=1&pageSize=50"));

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const body = await response.json();
    expect(body.data.every((payment: { id: string }) => payment.id !== otherPayment.id)).toBe(true);
  });

  it("filters by customerId", async () => {
    await signIn();

    const response = await GET(
      new Request(`http://localhost:3000/api/payments?customerId=${CUSTOMER_ID}&pageSize=50`),
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.every((payment: { customerId: string }) => payment.customerId === CUSTOMER_ID)).toBe(true);
  });

  it("filters by invoiceId", async () => {
    await signIn();
    const invoiceId = "50000000-0000-4000-8000-000000000007"; // fixture invoice with a payment

    const response = await GET(
      new Request(`http://localhost:3000/api/payments?invoiceId=${invoiceId}&pageSize=50`),
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.every((payment: { invoiceId: string }) => payment.invoiceId === invoiceId)).toBe(true);
    expect(body.data.length).toBeGreaterThan(0);
  });
});
