import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type {
  CustomerListQuery,
  CustomerWithBalance,
  InvoiceListQuery,
  InvoiceWithFinance,
  Paged,
  Session,
} from "@/lib/services/ports";
import { displayDate } from "@/components/ui/date-picker-test-helpers";

const mockRequireSessionOrRedirect = vi.fn<() => Promise<Session>>();
const mockListInvoices = vi.fn<
  (session: Session, query: InvoiceListQuery) => Promise<Paged<InvoiceWithFinance>>
>();
const mockListCustomers = vi.fn<
  (session: Session, query: CustomerListQuery) => Promise<Paged<CustomerWithBalance>>
>();

vi.mock("@/lib/mock/cookie-persistence", () => ({
  loadStoreFromCookie: vi.fn().mockResolvedValue(undefined),
  saveStoreToCookie: vi.fn(),
}));

vi.mock("@/lib/session", () => ({
  requireSessionOrRedirect: () => mockRequireSessionOrRedirect(),
}));

vi.mock("@/lib/services/invoice-service", () => ({
  listInvoices: (session: Session, query: InvoiceListQuery) => mockListInvoices(session, query),
}));

vi.mock("@/lib/services/customer-service", () => ({
  listCustomers: (session: Session, query: CustomerListQuery) => mockListCustomers(session, query),
}));

import InvoicesPage from "./page";

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

const INVOICE: InvoiceWithFinance = {
  id: "50000000-0000-4000-8000-000000000001",
  businessId: SESSION.businessId,
  customerId: CUSTOMER.id,
  invoiceTypeId: "c1000000-0000-4000-8000-000000000001",
  number: "FAC-0001",
  issueDate: "2026-07-01",
  dueDate: "2026-07-15",
  subtotal: 200000,
  total: 200000,
  status: "pending",
  notes: null,
  createdAt: "2024-01-01T00:00:00.000Z",
  updatedAt: "2024-01-01T00:00:00.000Z",
  paidAmount: 0,
  balance: 200000,
};

describe("InvoicesPage", () => {
  beforeEach(() => {
    mockRequireSessionOrRedirect.mockReset();
    mockListInvoices.mockReset();
    mockListCustomers.mockReset();
  });

  it("resolves the session first, then renders that session's scoped invoice list (number, customer, status)", async () => {
    mockRequireSessionOrRedirect.mockResolvedValue(SESSION);
    mockListInvoices.mockResolvedValue({ data: [INVOICE], page: 1, pageSize: 20, total: 1 });
    mockListCustomers.mockResolvedValue({ data: [CUSTOMER], page: 1, pageSize: 50, total: 1 });

    render(await InvoicesPage({ searchParams: Promise.resolve({}) }));

    expect(mockListInvoices).toHaveBeenCalledWith(SESSION, {
      customerId: undefined,
      status: undefined,
      from: undefined,
      to: undefined,
      page: 1,
      pageSize: 20,
    });
    expect(screen.getByText("FAC-0001")).toBeInTheDocument();
    // "Ana Gomez" appears twice — once as the customer-filter <option>, once
    // as the invoice row's customer cell — so assert both are present rather
    // than a single ambiguous match.
    expect(screen.getAllByText("Ana Gomez")).toHaveLength(2);
    // Likewise "Pendiente" appears both as the status-filter <option> and as
    // the row's status badge text.
    expect(screen.getAllByText("Pendiente").length).toBeGreaterThan(0);
  });

  it("wires DateFilterField into the filter form's from/to fields with defaultValue coming from searchParams", async () => {
    mockRequireSessionOrRedirect.mockResolvedValue(SESSION);
    mockListInvoices.mockResolvedValue({ data: [], page: 1, pageSize: 20, total: 0 });
    mockListCustomers.mockResolvedValue({ data: [CUSTOMER], page: 1, pageSize: 50, total: 1 });

    const { container } = render(
      await InvoicesPage({
        searchParams: Promise.resolve({ from: "2026-07-01", to: "2026-07-31" }),
      }),
    );

    expect(mockListInvoices).toHaveBeenCalledWith(
      SESSION,
      expect.objectContaining({ from: "2026-07-01", to: "2026-07-31" }),
    );

    // `DateFilterField` swaps to a hidden input (the one that actually
    // submits) + a `DatePicker` trigger once mounted (RTL's `render` flushes
    // the mount effect synchronously via `act()`); the hidden input's value
    // is the proof this is correctly wired from `searchParams`.
    const fromHidden = container.querySelector('input[type="hidden"][name="from"]') as HTMLInputElement;
    const toHidden = container.querySelector('input[type="hidden"][name="to"]') as HTMLInputElement;
    expect(fromHidden).toBeInTheDocument();
    expect(toHidden).toBeInTheDocument();
    expect(fromHidden.value).toBe("2026-07-01");
    expect(toHidden.value).toBe("2026-07-31");
    expect(screen.getByLabelText(/desde/i)).toHaveTextContent(displayDate("2026-07-01"));
    expect(screen.getByLabelText(/hasta/i)).toHaveTextContent(displayDate("2026-07-31"));
  });

  it("shows an empty state when there are no invoices", async () => {
    mockRequireSessionOrRedirect.mockResolvedValue(SESSION);
    mockListInvoices.mockResolvedValue({ data: [], page: 1, pageSize: 20, total: 0 });
    mockListCustomers.mockResolvedValue({ data: [], page: 1, pageSize: 50, total: 0 });

    render(await InvoicesPage({ searchParams: Promise.resolve({}) }));

    expect(screen.getByText(/no se encontraron facturas/i)).toBeInTheDocument();
  });

  it("redirects to /login instead of ever calling listInvoices when there is no valid session (defense in depth)", async () => {
    mockRequireSessionOrRedirect.mockRejectedValue(
      Object.assign(new Error("NEXT_REDIRECT"), { digest: "NEXT_REDIRECT;replace;/login;307;" })
    );

    await expect(InvoicesPage({ searchParams: Promise.resolve({}) })).rejects.toMatchObject({
      digest: expect.stringContaining("NEXT_REDIRECT"),
    });
    expect(mockListInvoices).not.toHaveBeenCalled();
  });
});
