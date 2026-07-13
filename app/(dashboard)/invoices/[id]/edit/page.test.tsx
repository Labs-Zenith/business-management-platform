import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { CustomerWithBalance, InvoiceDetail, Paged, Session } from "@/lib/services/ports";

/**
 * `app/(dashboard)/invoices/[id]/edit/page.tsx`, per this change's PR3 scope
 * (invoice editing UI). Mirrors `invoices/new/page.tsx`'s Server Component
 * shape closely — the highest-value test here is the zero-payments UI gate:
 * a paid invoice redirects back to the detail page rather than rendering an
 * edit form that would only ever be rejected server-side by the edit-lock
 * (`updateInvoice`'s `CONFLICT`). This redirect is a UX nicety, NOT the
 * enforcement — the server-side edit-lock is what actually protects the
 * invariant either way.
 */

const mockRequireSessionOrRedirect = vi.fn<() => Promise<Session>>();
const mockGetInvoice = vi.fn<(session: Session, id: string) => Promise<InvoiceDetail>>();
const mockListCustomers = vi.fn<() => Promise<Paged<CustomerWithBalance>>>();
const mockRedirect = vi.fn((url: string) => {
  throw Object.assign(new Error("NEXT_REDIRECT"), { digest: `NEXT_REDIRECT;replace;${url};307;` });
});

vi.mock("@/lib/mock/cookie-persistence", () => ({
  loadStoreFromCookie: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/session", () => ({
  requireSessionOrRedirect: () => mockRequireSessionOrRedirect(),
}));

vi.mock("@/lib/services/invoice-service", () => ({
  getInvoice: (session: Session, id: string) => mockGetInvoice(session, id),
}));

vi.mock("@/lib/services/customer-service", () => ({
  listCustomers: () => mockListCustomers(),
}));

vi.mock("next/navigation", () => ({
  redirect: (url: string) => mockRedirect(url),
}));

// InvoiceForm is lazy (`dynamic(..., {ssr:false})`) and has its own dedicated
// test file (`invoice-form-content.test.tsx`) — stub here to a marker
// exposing the `invoice`/`customers` props it received, mirroring
// `nomina/page.test.tsx`'s dialog-stubbing convention.
vi.mock("@/components/domain/invoices/invoice-form", () => ({
  default: ({ invoice, customers }: { invoice?: { id: string }; customers: Array<{ id: string; name: string }> }) => (
    <div data-testid="invoice-form">{JSON.stringify({ invoice, customers })}</div>
  ),
}));

import EditInvoicePage from "./page";

const SESSION: Session = {
  userId: "20000000-0000-4000-8000-000000000001",
  businessId: "10000000-0000-4000-8000-000000000001",
  email: "demo@negociodemo.test",
  role: "admin",
};

const INVOICE_ID = "50000000-0000-4000-8000-000000000001";

function buildInvoice(overrides: Partial<InvoiceDetail> = {}): InvoiceDetail {
  return {
    id: INVOICE_ID,
    businessId: SESSION.businessId,
    customerId: "40000000-0000-4000-8000-000000000001",
    number: "FAC-0001",
    issueDate: "2026-07-01",
    dueDate: "2026-07-15",
    subtotal: 100_000,
    total: 100_000,
    status: "pending",
    notes: "Nota",
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-01T00:00:00.000Z",
    paidAmount: 0,
    balance: 100_000,
    customer: {
      id: "40000000-0000-4000-8000-000000000001",
      businessId: SESSION.businessId,
      name: "Ana Gomez",
      documentNumber: null,
      email: null,
      phone: null,
      address: null,
      notes: null,
      isActive: true,
      createdAt: "2024-01-01T00:00:00.000Z",
      updatedAt: "2024-01-01T00:00:00.000Z",
    },
    items: [
      {
        id: "60000000-0000-4000-8000-000000000001",
        invoiceId: INVOICE_ID,
        description: "Consultoria",
        quantity: 1,
        unitPrice: 100_000,
        lineTotal: 100_000,
      },
    ],
    payments: [],
    ...overrides,
  };
}

describe("EditInvoicePage", () => {
  beforeEach(() => {
    mockRequireSessionOrRedirect.mockReset();
    mockGetInvoice.mockReset();
    mockListCustomers.mockReset();
    mockRedirect.mockClear();
  });

  it("pre-fills InvoiceForm with the fetched invoice's data when paidAmount === 0", async () => {
    mockRequireSessionOrRedirect.mockResolvedValue(SESSION);
    mockGetInvoice.mockResolvedValue(buildInvoice());
    mockListCustomers.mockResolvedValue({
      data: [{ ...buildInvoice().customer, balance: 0 }],
      page: 1,
      pageSize: 50,
      total: 1,
    });

    render(await EditInvoicePage({ params: Promise.resolve({ id: INVOICE_ID }) }));

    expect(mockGetInvoice).toHaveBeenCalledWith(SESSION, INVOICE_ID);
    const form = JSON.parse(screen.getByTestId("invoice-form").textContent ?? "{}");
    expect(form.invoice.id).toBe(INVOICE_ID);
    expect(mockRedirect).not.toHaveBeenCalled();
  });

  it("redirects back to the invoice detail page instead of rendering the form when the invoice already has a payment (paidAmount > 0)", async () => {
    mockRequireSessionOrRedirect.mockResolvedValue(SESSION);
    mockGetInvoice.mockResolvedValue(buildInvoice({ paidAmount: 40_000, balance: 60_000 }));

    await expect(EditInvoicePage({ params: Promise.resolve({ id: INVOICE_ID }) })).rejects.toMatchObject({
      digest: expect.stringContaining("NEXT_REDIRECT"),
    });

    expect(mockRedirect).toHaveBeenCalledWith(`/invoices/${INVOICE_ID}`);
    expect(mockListCustomers).not.toHaveBeenCalled();
  });

  it("redirects back to the invoice detail page for a fully-paid invoice (balance === 0) under the same edit-lock rule", async () => {
    mockRequireSessionOrRedirect.mockResolvedValue(SESSION);
    mockGetInvoice.mockResolvedValue(buildInvoice({ paidAmount: 100_000, balance: 0, status: "paid" }));

    await expect(EditInvoicePage({ params: Promise.resolve({ id: INVOICE_ID }) })).rejects.toMatchObject({
      digest: expect.stringContaining("NEXT_REDIRECT"),
    });

    expect(mockRedirect).toHaveBeenCalledWith(`/invoices/${INVOICE_ID}`);
  });
});
