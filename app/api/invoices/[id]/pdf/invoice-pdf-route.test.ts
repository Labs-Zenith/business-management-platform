import { beforeEach, describe, expect, it, vi } from "vitest";
import { resetStore, store } from "@/lib/mock/store";
import { repositories } from "@/lib/services/repositories";
import type { Invoice } from "@/lib/services/ports";

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

const BUSINESS_ID = "10000000-0000-4000-8000-000000000001";
const OTHER_BUSINESS_ID = "10000000-0000-4000-8000-000000000099";
const DEMO_EMAIL = "demo@negociodemo.test";
const DEMO_PASSWORD = "demo1234";
const INVOICE_ID = "50000000-0000-4000-8000-000000000001";

function buildContext(id: string) {
  return { params: Promise.resolve({ id }) };
}

async function signIn(): Promise<void> {
  const session = await repositories.auth.signIn(DEMO_EMAIL, DEMO_PASSWORD);
  if (!session) {
    throw new Error("Test setup failed: demo sign-in did not succeed.");
  }
}

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
    notes: null,
    createdAt: "2024-01-01T00:00:00.000Z",
    updatedAt: "2024-01-01T00:00:00.000Z",
  };
  store.invoices.set(invoice.id, invoice);
  return invoice;
}

describe("GET /api/invoices/[id]/pdf", () => {
  beforeEach(() => {
    resetStore();
    mockCookieJar.clear();
  });

  it("downloads an own-business invoice as a PDF attachment", async () => {
    await signIn();

    const response = await GET(new Request(`http://localhost:3000/api/invoices/${INVOICE_ID}/pdf`), buildContext(INVOICE_ID));
    const bytes = Buffer.from(await response.arrayBuffer());

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/pdf");
    expect(response.headers.get("content-disposition")).toMatch(/attachment; filename="factura-/);
    expect(bytes.subarray(0, 4).toString("utf8")).toBe("%PDF");
    expect(bytes.length).toBeGreaterThan(1000);
  });

  it("rejects a cross-business invoice id with NOT_FOUND", async () => {
    await signIn();
    const otherInvoice = seedOtherBusinessInvoice();

    const response = await GET(
      new Request(`http://localhost:3000/api/invoices/${otherInvoice.id}/pdf`),
      buildContext(otherInvoice.id),
    );

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error.code).toBe("NOT_FOUND");
  });

  it("keeps invoice PDF scoped to the session business, never a supplied business id", async () => {
    await signIn();

    const response = await GET(
      new Request(`http://localhost:3000/api/invoices/${INVOICE_ID}/pdf?businessId=${OTHER_BUSINESS_ID}`),
      buildContext(INVOICE_ID),
    );

    expect(response.status).toBe(200);
    expect(store.invoices.get(INVOICE_ID)?.businessId).toBe(BUSINESS_ID);
  });
});
