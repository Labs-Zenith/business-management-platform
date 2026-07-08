import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ApiError } from "@/lib/server/api-error";
import type { Business, InvoiceDetail, Session } from "@/lib/services/ports";

const mockRequireSession = vi.fn<() => Promise<Session>>();
const mockGetInvoice = vi.fn<(session: Session, id: string) => Promise<InvoiceDetail>>();
const mockGetBusinessProfile = vi.fn<(session: Session) => Promise<Business>>();

vi.mock("@/lib/session", () => ({
  requireSession: () => mockRequireSession(),
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
    mockRequireSession.mockReset();
    mockGetInvoice.mockReset();
    mockGetBusinessProfile.mockReset();
  });

  it("renders business/customer/invoice data AND the verbatim, non-removable DIAN legal notice", async () => {
    mockRequireSession.mockResolvedValue(SESSION);
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

    // The EXACT, VERBATIM, non-removable legal notice — not a paraphrase.
    expect(
      screen.getByText("Documento interno, no valido como factura electronica DIAN."),
    ).toBeInTheDocument();
  });

  it("rejects a cross-business invoice id with NOT_FOUND instead of rendering another business's receipt", async () => {
    mockRequireSession.mockResolvedValue(SESSION);
    mockGetInvoice.mockRejectedValue(new ApiError("NOT_FOUND", "Invoice not found."));
    mockGetBusinessProfile.mockResolvedValue(BUSINESS);

    await expect(
      InvoiceReceiptPage({ params: Promise.resolve({ id: "cross-business-invoice-id" }) }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("blocks unauthenticated access: propagates requireSession's UNAUTHENTICATED rejection and never calls getInvoice", async () => {
    mockRequireSession.mockRejectedValue(new ApiError("UNAUTHENTICATED", "Authentication required."));

    await expect(
      InvoiceReceiptPage({ params: Promise.resolve({ id: INVOICE_ID }) }),
    ).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
    expect(mockGetInvoice).not.toHaveBeenCalled();
  });
});
