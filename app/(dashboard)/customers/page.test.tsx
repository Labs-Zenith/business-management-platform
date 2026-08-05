import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { CustomerListQuery, CustomerWithBalance, Paged, Session } from "@/lib/services/ports";

const mockRequireSessionOrRedirect = vi.fn<() => Promise<Session>>();
const mockListCustomers = vi.fn<
  (session: Session, query: CustomerListQuery) => Promise<Paged<CustomerWithBalance>>
>();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

vi.mock("@/lib/mock/cookie-persistence", () => ({
  loadStoreFromCookie: vi.fn().mockResolvedValue(undefined),
  saveStoreToCookie: vi.fn(),
}));

vi.mock("@/lib/session", () => ({
  requireSessionOrRedirect: () => mockRequireSessionOrRedirect(),
}));

vi.mock("@/lib/services/customer-service", () => ({
  listCustomers: (session: Session, query: CustomerListQuery) => mockListCustomers(session, query),
}));

import CustomersPage from "./page";

const SESSION: Session = {
  userId: "20000000-0000-4000-8000-000000000001",
  businessId: "10000000-0000-4000-8000-000000000001",
  email: "demo@negociodemo.test",
  role: "admin",
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
    mockRequireSessionOrRedirect.mockReset();
    mockListCustomers.mockReset();
  });

  it("resolves the session first, then renders that session's scoped customer list (name, phone, balance, status)", async () => {
    mockRequireSessionOrRedirect.mockResolvedValue(SESSION);
    mockListCustomers.mockResolvedValue({ data: [CUSTOMER], page: 1, pageSize: 20, total: 1 });

    render(await CustomersPage({ searchParams: Promise.resolve({}) }));

    expect(mockListCustomers).toHaveBeenCalledWith(SESSION, {
      q: undefined,
      status: undefined,
      sortBy: "name",
      sortDir: "asc",
      page: 1,
      pageSize: 20,
    });
    expect(screen.getByText("Ana Gomez")).toBeInTheDocument();
    expect(screen.getByText("3001111111")).toBeInTheDocument();
    expect(screen.getByText("Activo")).toBeInTheDocument();
  });

  it("passes q/status/page search params through to the service", async () => {
    mockRequireSessionOrRedirect.mockResolvedValue(SESSION);
    mockListCustomers.mockResolvedValue({ data: [], page: 2, pageSize: 20, total: 0 });

    render(
      await CustomersPage({
        searchParams: Promise.resolve({ q: "Ana", status: "active", page: "2" }),
      }),
    );

    expect(mockListCustomers).toHaveBeenCalledWith(SESSION, {
      q: "Ana",
      status: "active",
      sortBy: "name",
      sortDir: "asc",
      page: 2,
      pageSize: 20,
    });
  });

  it("renders TablePagination page links that preserve the current q/status filters", async () => {
    mockRequireSessionOrRedirect.mockResolvedValue(SESSION);
    mockListCustomers.mockResolvedValue({ data: [CUSTOMER], page: 2, pageSize: 20, total: 45 });

    render(
      await CustomersPage({
        searchParams: Promise.resolve({ q: "Ana", status: "active", page: "2" }),
      }),
    );

    expect(screen.getByRole("link", { name: /siguiente/i })).toHaveAttribute(
      "href",
      "/customers?q=Ana&status=active&page=3",
    );
    expect(screen.getByText(/45 clientes/)).toBeInTheDocument();
  });

  it("shows an empty state when there are no customers", async () => {
    mockRequireSessionOrRedirect.mockResolvedValue(SESSION);
    mockListCustomers.mockResolvedValue({ data: [], page: 1, pageSize: 20, total: 0 });

    render(await CustomersPage({ searchParams: Promise.resolve({}) }));

    expect(screen.getByText(/no se encontraron clientes/i)).toBeInTheDocument();
  });

  it("redirects to /login instead of ever calling listCustomers when there is no valid session (defense in depth)", async () => {
    // Real `requireSessionOrRedirect()` never resolves here — it calls
    // `next/navigation`'s `redirect("/login")`, which throws Next's internal
    // `NEXT_REDIRECT` signal (a real redirect, not a crash).
    mockRequireSessionOrRedirect.mockRejectedValue(
      Object.assign(new Error("NEXT_REDIRECT"), { digest: "NEXT_REDIRECT;replace;/login;307;" })
    );

    await expect(CustomersPage({ searchParams: Promise.resolve({}) })).rejects.toMatchObject({
      digest: expect.stringContaining("NEXT_REDIRECT"),
    });
    expect(mockListCustomers).not.toHaveBeenCalled();
  });

  it("eventually renders the lazily-loaded 'Crear cliente' trigger", async () => {
    mockRequireSessionOrRedirect.mockResolvedValue(SESSION);
    mockListCustomers.mockResolvedValue({ data: [], page: 1, pageSize: 20, total: 0 });

    render(await CustomersPage({ searchParams: Promise.resolve({}) }));

    expect(await screen.findByRole("button", { name: /crear cliente/i })).toBeInTheDocument();
  });

  it("opens the edit dialog pre-filled with the row's customer when 'Editar' is clicked (no navigation)", async () => {
    const user = userEvent.setup();
    mockRequireSessionOrRedirect.mockResolvedValue(SESSION);
    mockListCustomers.mockResolvedValue({ data: [CUSTOMER], page: 1, pageSize: 20, total: 1 });

    render(await CustomersPage({ searchParams: Promise.resolve({}) }));

    await user.click(await screen.findByRole("button", { name: /editar/i }));

    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Editar cliente" })).toBeInTheDocument();
    expect(screen.getByDisplayValue(CUSTOMER.name)).toBeInTheDocument();
  });

  it("uses the shared SelectFilterField for Estado instead of a bare native select", async () => {
    mockRequireSessionOrRedirect.mockResolvedValue(SESSION);
    mockListCustomers.mockResolvedValue({ data: [CUSTOMER], page: 1, pageSize: 20, total: 1 });

    const { container } = render(await CustomersPage({ searchParams: Promise.resolve({}) }));

    // This was the only page still hand-rolling a <select>, so it missed the
    // shared control's auto-submit behavior.
    expect(container.querySelector("select")).toBeNull();
    expect(screen.getByLabelText(/estado/i)).toHaveAttribute("role", "combobox");
  });

  it("threads a whitelisted sort through, and falls back for an unknown column", async () => {
    mockRequireSessionOrRedirect.mockResolvedValue(SESSION);
    mockListCustomers.mockResolvedValue({ data: [CUSTOMER], page: 1, pageSize: 20, total: 1 });

    render(await CustomersPage({ searchParams: Promise.resolve({ sort: "balance", dir: "desc" }) }));
    expect(mockListCustomers).toHaveBeenCalledWith(
      SESSION,
      expect.objectContaining({ sortBy: "balance", sortDir: "desc" }),
    );

    mockListCustomers.mockClear();
    render(await CustomersPage({ searchParams: Promise.resolve({ sort: "nope", dir: "desc" }) }));
    expect(mockListCustomers).toHaveBeenCalledWith(
      SESSION,
      expect.objectContaining({ sortBy: "name", sortDir: "asc" }),
    );
  });

  it("keeps the search term in the sort links and resets the page", async () => {
    mockRequireSessionOrRedirect.mockResolvedValue(SESSION);
    mockListCustomers.mockResolvedValue({ data: [CUSTOMER], page: 2, pageSize: 20, total: 40 });

    render(await CustomersPage({ searchParams: Promise.resolve({ q: "Ana", page: "2" }) }));

    expect(screen.getByRole("link", { name: /saldo pendiente/i })).toHaveAttribute(
      "href",
      "/customers?q=Ana&sort=balance&dir=desc",
    );
  });

});
