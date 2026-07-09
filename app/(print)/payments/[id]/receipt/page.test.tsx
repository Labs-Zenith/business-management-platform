import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ApiError } from "@/lib/server/api-error";
import type { Business, PaymentWithRefs, Session } from "@/lib/services/ports";

const mockRequireSession = vi.fn<() => Promise<Session>>();
const mockGetPayment = vi.fn<(session: Session, id: string) => Promise<PaymentWithRefs>>();
const mockGetBusinessProfile = vi.fn<(session: Session) => Promise<Business>>();

vi.mock("@/lib/mock/cookie-persistence", () => ({
  loadStoreFromCookie: vi.fn().mockResolvedValue(undefined),
  saveStoreToCookie: vi.fn(),
}));

vi.mock("@/lib/session", () => ({
  requireSession: () => mockRequireSession(),
}));

vi.mock("@/lib/services/payment-service", () => ({
  getPayment: (session: Session, id: string) => mockGetPayment(session, id),
}));

vi.mock("@/lib/services/business-service", () => ({
  getBusinessProfile: (session: Session) => mockGetBusinessProfile(session),
}));

import PaymentReceiptPage from "./page";

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

const PAYMENT_ID = "60000000-0000-4000-8000-000000000001";

const PAYMENT: PaymentWithRefs = {
  id: PAYMENT_ID,
  businessId: SESSION.businessId,
  invoiceId: "50000000-0000-4000-8000-000000000001",
  customerId: "40000000-0000-4000-8000-000000000001",
  paymentDate: "2026-07-08",
  amount: 40000,
  method: "cash",
  notes: null,
  createdAt: "2024-01-01T00:00:00.000Z",
  updatedAt: "2024-01-01T00:00:00.000Z",
  customer: { id: "40000000-0000-4000-8000-000000000001", name: "Ana Gomez" },
  invoice: { id: "50000000-0000-4000-8000-000000000001", number: "FAC-0001" },
};

describe("PaymentReceiptPage (printable comprobante de pago)", () => {
  beforeEach(() => {
    mockRequireSession.mockReset();
    mockGetPayment.mockReset();
    mockGetBusinessProfile.mockReset();
  });

  it("renders business/customer/invoice-reference/payment data AND the verbatim, non-removable DIAN legal notice", async () => {
    mockRequireSession.mockResolvedValue(SESSION);
    mockGetPayment.mockResolvedValue(PAYMENT);
    mockGetBusinessProfile.mockResolvedValue(BUSINESS);

    render(await PaymentReceiptPage({ params: Promise.resolve({ id: PAYMENT_ID }) }));

    expect(mockGetPayment).toHaveBeenCalledWith(SESSION, PAYMENT_ID);
    expect(mockGetBusinessProfile).toHaveBeenCalledWith(SESSION);

    expect(screen.getByText("Negocio Demo SAS")).toBeInTheDocument();
    expect(screen.getByText("Ana Gomez")).toBeInTheDocument();
    expect(screen.getByText("FAC-0001")).toBeInTheDocument();
    expect(screen.getByText("cash")).toBeInTheDocument();

    // The EXACT, VERBATIM, non-removable legal notice — same text as the
    // invoice receipt, not a paraphrase or translation.
    expect(
      screen.getByText("Documento interno, no valido como factura electronica DIAN."),
    ).toBeInTheDocument();
  });

  it("renders a mock comprobante for NOT_FOUND instead of failing or leaking another business's receipt", async () => {
    mockRequireSession.mockResolvedValue(SESSION);
    mockGetPayment.mockRejectedValue(new ApiError("NOT_FOUND", "Payment not found."));
    mockGetBusinessProfile.mockResolvedValue(BUSINESS);

    render(await PaymentReceiptPage({ params: Promise.resolve({ id: "cross-business-payment-id" }) }));

    expect(screen.getByText("Cliente demo")).toBeInTheDocument();
    expect(screen.getByText("Factura demo")).toBeInTheDocument();
  });

  it("renders a mock comprobante when the payment is missing in the mocked environment", async () => {
    mockRequireSession.mockResolvedValue(SESSION);
    mockGetPayment.mockRejectedValue(new ApiError("NOT_FOUND", "Payment not found."));
    mockGetBusinessProfile.mockResolvedValue(BUSINESS);

    render(await PaymentReceiptPage({ params: Promise.resolve({ id: "missing-payment-id" }) }));

    expect(screen.getByText("Comprobante de pago")).toBeInTheDocument();
    expect(screen.getByText("Cliente demo")).toBeInTheDocument();
    expect(screen.getByText("Factura demo")).toBeInTheDocument();
    expect(screen.getByText("Mock")).toBeInTheDocument();
    expect(screen.getByText("Documento interno, no valido como factura electronica DIAN.")).toBeInTheDocument();
  });

  it("blocks unauthenticated access: propagates requireSession's UNAUTHENTICATED rejection and never calls getPayment", async () => {
    mockRequireSession.mockRejectedValue(new ApiError("UNAUTHENTICATED", "Authentication required."));

    await expect(
      PaymentReceiptPage({ params: Promise.resolve({ id: PAYMENT_ID }) }),
    ).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
    expect(mockGetPayment).not.toHaveBeenCalled();
  });
});
