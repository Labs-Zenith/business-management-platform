import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { formatCOP } from "@/lib/money";
import { ApiError } from "@/lib/server/api-error";
import type { CustomerDetail, Session } from "@/lib/services/ports";

const mockRequireSession = vi.fn<() => Promise<Session>>();
const mockGetCustomer = vi.fn<(session: Session, id: string) => Promise<CustomerDetail>>();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

vi.mock("@/lib/session", () => ({
  requireSession: () => mockRequireSession(),
}));

vi.mock("@/lib/services/customer-service", () => ({
  getCustomer: (session: Session, id: string) => mockGetCustomer(session, id),
}));

import CustomerDetailPage from "./page";

const SESSION: Session = {
  userId: "20000000-0000-4000-8000-000000000001",
  businessId: "10000000-0000-4000-8000-000000000001",
  email: "demo@negociodemo.test",
};

const CUSTOMER_ID = "40000000-0000-4000-8000-000000000001";

const CUSTOMER_DETAIL: CustomerDetail = {
  id: CUSTOMER_ID,
  businessId: SESSION.businessId,
  name: "Ana Gomez",
  documentNumber: "1000000001",
  email: "ana.gomez@example.com",
  phone: "3001111111",
  address: "Cra 1 # 2-3",
  notes: null,
  isActive: true,
  createdAt: "2024-01-01T00:00:00.000Z",
  updatedAt: "2024-01-01T00:00:00.000Z",
  totalInvoiced: 500000,
  totalPaid: 200000,
  balance: 300000,
  recentInvoices: [],
  recentPayments: [],
};

describe("CustomerDetailPage", () => {
  beforeEach(() => {
    mockRequireSession.mockReset();
    mockGetCustomer.mockReset();
  });

  it("resolves the session first, then renders that customer's financial summary scoped by id", async () => {
    mockRequireSession.mockResolvedValue(SESSION);
    mockGetCustomer.mockResolvedValue(CUSTOMER_DETAIL);

    render(await CustomerDetailPage({ params: Promise.resolve({ id: CUSTOMER_ID }) }));

    expect(mockGetCustomer).toHaveBeenCalledWith(SESSION, CUSTOMER_ID);
    // `getByText`'s default normalizer collapses ALL whitespace (including
    // `formatCOP`'s real NBSP) to a regular space, so the query string must
    // be normalized the same way to match.
    const normalize = (value: string) => value.replace(/ /g, " ");

    expect(screen.getByText("Ana Gomez")).toBeInTheDocument();
    expect(screen.getByText(normalize(formatCOP(CUSTOMER_DETAIL.totalInvoiced)))).toBeInTheDocument();
    expect(screen.getByText(normalize(formatCOP(CUSTOMER_DETAIL.totalPaid)))).toBeInTheDocument();
    expect(screen.getByText(normalize(formatCOP(CUSTOMER_DETAIL.balance)))).toBeInTheDocument();
  });

  it("propagates a NOT_FOUND rejection from getCustomer (cross-business access) instead of rendering any data", async () => {
    mockRequireSession.mockResolvedValue(SESSION);
    mockGetCustomer.mockRejectedValue(new ApiError("NOT_FOUND", "Customer not found."));

    await expect(
      CustomerDetailPage({ params: Promise.resolve({ id: "cross-business-id" }) }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("propagates requireSession's UNAUTHENTICATED rejection instead of ever calling getCustomer (defense in depth)", async () => {
    mockRequireSession.mockRejectedValue(new ApiError("UNAUTHENTICATED", "Authentication required."));

    await expect(
      CustomerDetailPage({ params: Promise.resolve({ id: CUSTOMER_ID }) }),
    ).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
    expect(mockGetCustomer).not.toHaveBeenCalled();
  });
});
