import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { Paged, PaymentListQuery, PaymentWithRefs, Session } from "@/lib/services/ports";

const mockRequireSessionOrRedirect = vi.fn<() => Promise<Session>>();
const mockListPayments = vi.fn<(session: Session, query: PaymentListQuery) => Promise<Paged<PaymentWithRefs>>>();

vi.mock("@/lib/mock/cookie-persistence", () => ({
  loadStoreFromCookie: vi.fn().mockResolvedValue(undefined),
  saveStoreToCookie: vi.fn(),
}));

vi.mock("@/lib/session", () => ({
  requireSessionOrRedirect: () => mockRequireSessionOrRedirect(),
}));

vi.mock("@/lib/services/payment-service", () => ({
  listPayments: (session: Session, query: PaymentListQuery) => mockListPayments(session, query),
}));

import PaymentsPage from "./page";

const SESSION: Session = {
  userId: "20000000-0000-4000-8000-000000000001",
  businessId: "10000000-0000-4000-8000-000000000001",
  email: "demo@negociodemo.test",
  role: "admin",
};

const PAYMENT: PaymentWithRefs = {
  id: "60000000-0000-4000-8000-000000000001",
  businessId: SESSION.businessId,
  invoiceId: "50000000-0000-4000-8000-000000000001",
  customerId: "40000000-0000-4000-8000-000000000001",
  paymentDate: "2026-07-08",
  amount: 200000,
  method: "cash",
  notes: null,
  createdAt: "2024-01-01T00:00:00.000Z",
  updatedAt: "2024-01-01T00:00:00.000Z",
  customer: { id: "40000000-0000-4000-8000-000000000001", name: "Ana Gomez" },
  invoice: { id: "50000000-0000-4000-8000-000000000001", number: "FAC-0001" },
};

describe("PaymentsPage", () => {
  beforeEach(() => {
    mockRequireSessionOrRedirect.mockReset();
    mockListPayments.mockReset();
  });

  it("resolves the session first, then renders that session's scoped payment list (customer, invoice, amount, method, date)", async () => {
    mockRequireSessionOrRedirect.mockResolvedValue(SESSION);
    mockListPayments.mockResolvedValue({ data: [PAYMENT], page: 1, pageSize: 20, total: 1 });

    render(await PaymentsPage({ searchParams: Promise.resolve({}) }));

    expect(mockListPayments).toHaveBeenCalledWith(SESSION, {
      customerId: undefined,
      invoiceId: undefined,
      from: undefined,
      to: undefined,
      page: 1,
      pageSize: 20,
    });
    expect(screen.getByText("Ana Gomez")).toBeInTheDocument();
    expect(screen.getByText("FAC-0001")).toBeInTheDocument();
    expect(screen.getByText("cash")).toBeInTheDocument();
  });

  it("passes customerId/invoiceId/from/to/page search params through to the service", async () => {
    mockRequireSessionOrRedirect.mockResolvedValue(SESSION);
    mockListPayments.mockResolvedValue({ data: [], page: 2, pageSize: 20, total: 0 });

    render(
      await PaymentsPage({
        searchParams: Promise.resolve({
          customerId: "cust-1",
          invoiceId: "inv-1",
          from: "2026-07-01",
          to: "2026-07-31",
          page: "2",
        }),
      }),
    );

    expect(mockListPayments).toHaveBeenCalledWith(SESSION, {
      customerId: "cust-1",
      invoiceId: "inv-1",
      from: "2026-07-01",
      to: "2026-07-31",
      page: 2,
      pageSize: 20,
    });
  });

  it("shows an empty state when there are no payments", async () => {
    mockRequireSessionOrRedirect.mockResolvedValue(SESSION);
    mockListPayments.mockResolvedValue({ data: [], page: 1, pageSize: 20, total: 0 });

    render(await PaymentsPage({ searchParams: Promise.resolve({}) }));

    expect(screen.getByText(/no se encontraron pagos/i)).toBeInTheDocument();
  });

  it("redirects to /login instead of ever calling listPayments when there is no valid session (defense in depth)", async () => {
    mockRequireSessionOrRedirect.mockRejectedValue(
      Object.assign(new Error("NEXT_REDIRECT"), { digest: "NEXT_REDIRECT;replace;/login;307;" })
    );

    await expect(PaymentsPage({ searchParams: Promise.resolve({}) })).rejects.toMatchObject({
      digest: expect.stringContaining("NEXT_REDIRECT"),
    });
    expect(mockListPayments).not.toHaveBeenCalled();
  });
});
