import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ApiError } from "@/lib/server/api-error";
import type { Business, InvoiceDetail, Session } from "@/lib/services/ports";

const mockRequireSessionOrRedirect = vi.fn<() => Promise<Session>>();
const mockGetInvoice = vi.fn<(session: Session, id: string) => Promise<InvoiceDetail>>();
const mockGetBusinessProfile = vi.fn<(session: Session) => Promise<Business>>();

vi.mock("@/lib/mock/cookie-persistence", () => ({
  loadStoreFromCookie: vi.fn().mockResolvedValue(undefined),
  saveStoreToCookie: vi.fn(),
}));

vi.mock("@/lib/session", () => ({
  requireSessionOrRedirect: () => mockRequireSessionOrRedirect(),
}));

vi.mock("@/lib/services/invoice-service", () => ({
  getInvoice: (session: Session, id: string) => mockGetInvoice(session, id),
}));

vi.mock("@/lib/services/business-service", () => ({
  getBusinessProfile: (session: Session) => mockGetBusinessProfile(session),
}));

import InvoiceReceiptPage from "./page";

const SESSION: Session = {
  userId: "20000000-0000-4000-8000-000000000001",
  businessId: "10000000-0000-4000-8000-000000000001",
  email: "demo@negociodemo.test",
  role: "admin",
};

const BUSINESS: Business = {
  id: SESSION.businessId,
  name: "Negocio Demo SAS",
  email: "contacto@negociodemo.test",
  phone: "3000000000",
  address: "Cra 1 # 2-3",
  currency: "COP",
  createdAt: "2024-01-01T00:00:00.000Z",
  updatedAt: "2024-01-01T00:00:00.000Z",
};

const INVOICE_ID = "50000000-0000-4000-8000-000000000001";

const INVOICE_DETAIL: InvoiceDetail = {
  id: INVOICE_ID,
  businessId: SESSION.businessId,
  customerId: "40000000-0000-4000-8000-000000000001",
  invoiceTypeId: "c1000000-0000-4000-8000-000000000001",
  number: "FAC-0001",
  issueDate: "2026-07-01",
  dueDate: "2026-08-01",
  subtotal: 100000,
  total: 100000,
  status: "partially_paid",
  notes: null,
  createdAt: "2024-01-01T00:00:00.000Z",
  updatedAt: "2024-01-01T00:00:00.000Z",
  paidAmount: 40000,
  balance: 60000,
  customer: {
    id: "40000000-0000-4000-8000-000000000001",
    businessId: SESSION.businessId,
    name: "Ana Gomez",
    documentNumber: "1000000001",
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
      id: "70000000-0000-4000-8000-000000000001",
      invoiceId: INVOICE_ID,
      description: "Servicio de consultoria",
      quantity: 1,
      unitPrice: 100000,
      lineTotal: 100000,
    },
  ],
  payments: [],
};

describe("InvoiceReceiptPage (printable comprobante)", () => {
  beforeEach(() => {
    mockRequireSessionOrRedirect.mockReset();
    mockGetInvoice.mockReset();
    mockGetBusinessProfile.mockReset();
  });

  it("renders business/customer/invoice data and never renders the removed DIAN notice", async () => {
    mockRequireSessionOrRedirect.mockResolvedValue(SESSION);
    mockGetInvoice.mockResolvedValue(INVOICE_DETAIL);
    mockGetBusinessProfile.mockResolvedValue(BUSINESS);

    render(await InvoiceReceiptPage({ params: Promise.resolve({ id: INVOICE_ID }) }));

    expect(mockGetInvoice).toHaveBeenCalledWith(SESSION, INVOICE_ID);
    expect(mockGetBusinessProfile).toHaveBeenCalledWith(SESSION);

    // Business + customer + invoice identifiers.
    expect(screen.getByText("Negocio Demo SAS")).toBeInTheDocument();
    expect(screen.getByText("Ana Gomez")).toBeInTheDocument();
    expect(screen.getByText("FAC-0001")).toBeInTheDocument();
    expect(screen.getByText("Servicio de consultoria")).toBeInTheDocument();

    // The DIAN legal notice was removed (Fase 2 plan item 1) — must never render.
    expect(
      screen.queryByText("Documento interno, no valido como factura electronica DIAN."),
    ).not.toBeInTheDocument();
  });

  it("rejects a cross-business invoice id with NOT_FOUND instead of rendering another business's receipt", async () => {
    mockRequireSessionOrRedirect.mockResolvedValue(SESSION);
    mockGetInvoice.mockRejectedValue(new ApiError("NOT_FOUND", "Invoice not found."));
    mockGetBusinessProfile.mockResolvedValue(BUSINESS);

    await expect(
      InvoiceReceiptPage({ params: Promise.resolve({ id: "cross-business-invoice-id" }) }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("blocks unauthenticated access: redirects to /login instead of crashing, and never calls getInvoice", async () => {
    mockRequireSessionOrRedirect.mockRejectedValue(
      Object.assign(new Error("NEXT_REDIRECT"), { digest: "NEXT_REDIRECT;replace;/login;307;" })
    );

    await expect(
      InvoiceReceiptPage({ params: Promise.resolve({ id: INVOICE_ID }) }),
    ).rejects.toMatchObject({ digest: expect.stringContaining("NEXT_REDIRECT") });
    expect(mockGetInvoice).not.toHaveBeenCalled();
  });
});
