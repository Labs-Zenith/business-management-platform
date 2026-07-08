import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ApiError } from "@/lib/server/api-error";
import type { CustomerListQuery, CustomerWithBalance, Paged, Session } from "@/lib/services/ports";

const mockRequireSession = vi.fn<() => Promise<Session>>();
const mockListCustomers = vi.fn<
  (session: Session, query: CustomerListQuery) => Promise<Paged<CustomerWithBalance>>
>();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

vi.mock("@/lib/session", () => ({
  requireSession: () => mockRequireSession(),
}));

vi.mock("@/lib/services/customer-service", () => ({
  listCustomers: (session: Session, query: CustomerListQuery) => mockListCustomers(session, query),
}));

import CustomersPage from "./page";

const SESSION: Session = {
  userId: "20000000-0000-4000-8000-000000000001",
  businessId: "10000000-0000-4000-8000-000000000001",
  email: "demo@negociodemo.test",
};

const CUSTOMER: CustomerWithBalance = {
  id: "40000000-0000-4000-8000-000000000001",
  businessId: SESSION.businessId,
  name: "Ana Gomez",
  documentNumber: "1000000001",
  email: "ana.gomez@example.com",
  phone: "3001111111",
  address: null,
  notes: null,
  isActive: true,
  createdAt: "2024-01-01T00:00:00.000Z",
  updatedAt: "2024-01-01T00:00:00.000Z",
  balance: 300000,
};

describe("CustomersPage", () => {
  beforeEach(() => {
    mockRequireSession.mockReset();
    mockListCustomers.mockReset();
  });

  it("resolves the session first, then renders that session's scoped customer list (name, phone, balance, status)", async () => {
    mockRequireSession.mockResolvedValue(SESSION);
    mockListCustomers.mockResolvedValue({ data: [CUSTOMER], page: 1, pageSize: 20, total: 1 });

    render(await CustomersPage({ searchParams: Promise.resolve({}) }));

    expect(mockListCustomers).toHaveBeenCalledWith(SESSION, {
      q: undefined,
      status: undefined,
      page: 1,
      pageSize: 20,
    });
    expect(screen.getByText("Ana Gomez")).toBeInTheDocument();
    expect(screen.getByText("3001111111")).toBeInTheDocument();
    expect(screen.getByText("Activo")).toBeInTheDocument();
  });

  it("passes q/status/page search params through to the service", async () => {
    mockRequireSession.mockResolvedValue(SESSION);
    mockListCustomers.mockResolvedValue({ data: [], page: 2, pageSize: 20, total: 0 });

    render(
      await CustomersPage({
        searchParams: Promise.resolve({ q: "Ana", status: "active", page: "2" }),
      }),
    );

    expect(mockListCustomers).toHaveBeenCalledWith(SESSION, {
      q: "Ana",
      status: "active",
      page: 2,
      pageSize: 20,
    });
  });

  it("shows an empty state when there are no customers", async () => {
    mockRequireSession.mockResolvedValue(SESSION);
    mockListCustomers.mockResolvedValue({ data: [], page: 1, pageSize: 20, total: 0 });

    render(await CustomersPage({ searchParams: Promise.resolve({}) }));

    expect(screen.getByText(/no se encontraron clientes/i)).toBeInTheDocument();
  });

  it("propagates requireSession's UNAUTHENTICATED rejection instead of ever calling listCustomers (defense in depth)", async () => {
    mockRequireSession.mockRejectedValue(new ApiError("UNAUTHENTICATED", "Authentication required."));

    await expect(CustomersPage({ searchParams: Promise.resolve({}) })).rejects.toMatchObject({
      code: "UNAUTHENTICATED",
    });
    expect(mockListCustomers).not.toHaveBeenCalled();
  });

  it("eventually renders the lazily-loaded 'Crear cliente' trigger", async () => {
    mockRequireSession.mockResolvedValue(SESSION);
    mockListCustomers.mockResolvedValue({ data: [], page: 1, pageSize: 20, total: 0 });

    render(await CustomersPage({ searchParams: Promise.resolve({}) }));

    expect(await screen.findByRole("button", { name: /crear cliente/i })).toBeInTheDocument();
  });
});
