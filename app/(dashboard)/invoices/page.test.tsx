import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type {
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
const mockListAllCustomers = vi.fn<(session: Session) => Promise<CustomerWithBalance[]>>();

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
  listAllCustomers: (session: Session) => mockListAllCustomers(session),
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
    mockListAllCustomers.mockReset();
  });

  it("resolves the session first, then renders that session's scoped invoice list (number, customer, status)", async () => {
    mockRequireSessionOrRedirect.mockResolvedValue(SESSION);
    mockListInvoices.mockResolvedValue({ data: [INVOICE], page: 1, pageSize: 20, total: 1 });
    mockListAllCustomers.mockResolvedValue([CUSTOMER]);

    render(await InvoicesPage({ searchParams: Promise.resolve({}) }));

    expect(mockListInvoices).toHaveBeenCalledWith(SESSION, {
      customerId: undefined,
      status: undefined,
      from: undefined,
      to: undefined,
      sortBy: "issueDate",
      sortDir: "desc",
      page: 1,
      pageSize: 20,
    });
    expect(screen.getByText("FAC-0001")).toBeInTheDocument();
    // Unlike the old native `<select>` (whose `<option>`s were always in the
    // DOM), the `SelectFilterField` popup only mounts its options once
    // opened — "Ana Gomez"/"Pendiente" now appear exactly once each (the
    // invoice row), not twice, until a filter Select is explicitly opened
    // (see the "customer/status filter Selects" tests below for that case).
    expect(screen.getByText("Ana Gomez")).toBeInTheDocument();
    expect(screen.getAllByText("Pendiente").length).toBeGreaterThan(0);
  });

  it("offers the customer and status filter options once their Select triggers are opened", async () => {
    mockRequireSessionOrRedirect.mockResolvedValue(SESSION);
    mockListInvoices.mockResolvedValue({ data: [INVOICE], page: 1, pageSize: 20, total: 1 });
    mockListAllCustomers.mockResolvedValue([CUSTOMER]);

    render(await InvoicesPage({ searchParams: Promise.resolve({}) }));

    const user = userEvent.setup();
    await user.click(screen.getByLabelText(/cliente/i));
    expect(await screen.findByRole("option", { name: "Ana Gomez" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Todos" })).toBeInTheDocument();
    await user.keyboard("{Escape}");

    await user.click(screen.getByLabelText(/estado/i));
    expect(await screen.findByRole("option", { name: "Pendiente" })).toBeInTheDocument();
  });

  it("wires DateFilterField into the filter form's from/to fields with defaultValue coming from searchParams", async () => {
    mockRequireSessionOrRedirect.mockResolvedValue(SESSION);
    mockListInvoices.mockResolvedValue({ data: [], page: 1, pageSize: 20, total: 0 });
    mockListAllCustomers.mockResolvedValue([CUSTOMER]);

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

  it("renders TablePagination page links that preserve the current filters", async () => {
    mockRequireSessionOrRedirect.mockResolvedValue(SESSION);
    mockListInvoices.mockResolvedValue({ data: [INVOICE], page: 2, pageSize: 20, total: 45 });
    mockListAllCustomers.mockResolvedValue([CUSTOMER]);

    render(
      await InvoicesPage({
        searchParams: Promise.resolve({ from: "2026-07-01", to: "2026-07-31", page: "2" }),
      }),
    );

    expect(screen.getByRole("link", { name: /siguiente/i })).toHaveAttribute(
      "href",
      "/invoices?from=2026-07-01&to=2026-07-31&page=3",
    );
    expect(screen.getByText(/45 facturas/)).toBeInTheDocument();
  });

  it("shows an empty state when there are no invoices", async () => {
    mockRequireSessionOrRedirect.mockResolvedValue(SESSION);
    mockListInvoices.mockResolvedValue({ data: [], page: 1, pageSize: 20, total: 0 });
    mockListAllCustomers.mockResolvedValue([]);

    render(await InvoicesPage({ searchParams: Promise.resolve({}) }));

    expect(screen.getByText(/no se encontraron facturas/i)).toBeInTheDocument();
  });

  it("threads a whitelisted sort through to the service", async () => {
    mockRequireSessionOrRedirect.mockResolvedValue(SESSION);
    mockListInvoices.mockResolvedValue({ data: [INVOICE], page: 1, pageSize: 20, total: 1 });
    mockListAllCustomers.mockResolvedValue([CUSTOMER]);

    render(await InvoicesPage({ searchParams: Promise.resolve({ sort: "total", dir: "asc" }) }));

    expect(mockListInvoices).toHaveBeenCalledWith(
      SESSION,
      expect.objectContaining({ sortBy: "total", sortDir: "asc" }),
    );
  });

  it("falls back to the default sort for an unknown column, never passing it through", async () => {
    mockRequireSessionOrRedirect.mockResolvedValue(SESSION);
    mockListInvoices.mockResolvedValue({ data: [INVOICE], page: 1, pageSize: 20, total: 1 });
    mockListAllCustomers.mockResolvedValue([CUSTOMER]);

    render(await InvoicesPage({ searchParams: Promise.resolve({ sort: "DROP TABLE", dir: "asc" }) }));

    // `sortBy` indexes a comparator map, so an unvalidated value would crash.
    expect(mockListInvoices).toHaveBeenCalledWith(
      SESSION,
      expect.objectContaining({ sortBy: "issueDate", sortDir: "desc" }),
    );
  });

  it("renders sort links that keep the live filters and reset the page", async () => {
    mockRequireSessionOrRedirect.mockResolvedValue(SESSION);
    mockListInvoices.mockResolvedValue({ data: [INVOICE], page: 2, pageSize: 20, total: 45 });
    mockListAllCustomers.mockResolvedValue([CUSTOMER]);

    render(
      await InvoicesPage({
        searchParams: Promise.resolve({ status: "pending", page: "2" }),
      }),
    );

    expect(screen.getByRole("link", { name: /^total/i })).toHaveAttribute(
      "href",
      "/invoices?status=pending&sort=total&dir=desc",
    );
  });

  it("marks the active column with aria-sort and flips its link", async () => {
    mockRequireSessionOrRedirect.mockResolvedValue(SESSION);
    mockListInvoices.mockResolvedValue({ data: [INVOICE], page: 1, pageSize: 20, total: 1 });
    mockListAllCustomers.mockResolvedValue([CUSTOMER]);

    render(await InvoicesPage({ searchParams: Promise.resolve({ sort: "total", dir: "desc" }) }));

    expect(screen.getByRole("columnheader", { name: /total/i })).toHaveAttribute("aria-sort", "descending");
    expect(screen.getByRole("link", { name: /^total/i })).toHaveAttribute("href", "/invoices?sort=total&dir=asc");
  });

  it("leaves the Cliente column unsortable, since the row has no customer name to order by", async () => {
    mockRequireSessionOrRedirect.mockResolvedValue(SESSION);
    mockListInvoices.mockResolvedValue({ data: [INVOICE], page: 1, pageSize: 20, total: 1 });
    mockListAllCustomers.mockResolvedValue([CUSTOMER]);

    render(await InvoicesPage({ searchParams: Promise.resolve({}) }));

    const clienteHeader = screen.getByRole("columnheader", { name: "Cliente" });
    expect(clienteHeader.querySelector("a")).toBeNull();
  });

  it("resolves customer names from the full customer list, not a first page of 50", async () => {
    mockRequireSessionOrRedirect.mockResolvedValue(SESSION);
    mockListInvoices.mockResolvedValue({ data: [INVOICE], page: 1, pageSize: 20, total: 1 });
    mockListAllCustomers.mockResolvedValue([CUSTOMER]);

    render(await InvoicesPage({ searchParams: Promise.resolve({}) }));

    // A capped lookup rendered "-" in this column for every customer past the
    // 50th, and dropped them from the Cliente filter entirely.
    expect(mockListAllCustomers).toHaveBeenCalledWith(SESSION);
    expect(screen.getByText("Ana Gomez")).toBeInTheDocument();
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
