import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import type { Expense, ExpenseListQuery, Paged, Session } from "@/lib/services/ports";

const mockRequireSessionOrRedirect = vi.fn<() => Promise<Session>>();
const mockListExpenses = vi.fn<(session: Session, query: ExpenseListQuery) => Promise<Paged<Expense>>>();

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

vi.mock("@/lib/services/expense-service", () => ({
  listExpenses: (session: Session, query: ExpenseListQuery) => mockListExpenses(session, query),
}));

// ExpenseFormDialog is lazy (`dynamic(..., {ssr:false})`) and has its own
// test file (`expense-form-dialog-content.test.tsx`) — stub to its trigger
// only, mirroring `invoices/[id]/page.test.tsx`'s convention for
// PaymentFormDialog.
vi.mock("@/components/domain/dashboard/expense-form-dialog", () => ({
  default: ({ trigger }: { trigger: ReactNode }) => trigger,
}));

import EgresosPage from "./page";

const SESSION: Session = {
  userId: "20000000-0000-4000-8000-000000000001",
  businessId: "10000000-0000-4000-8000-000000000001",
  email: "demo@negociodemo.test",
  role: "admin",
};

const EXPENSE: Expense = {
  id: "60000000-0000-4000-8000-000000000001",
  businessId: SESSION.businessId,
  category: "otro",
  expenseDate: "2026-07-06",
  description: "Papeleria",
  amount: 45_000,
  notes: null,
  createdAt: "2026-07-06T00:00:00.000Z",
  updatedAt: "2026-07-06T00:00:00.000Z",
};

describe("EgresosPage", () => {
  beforeEach(() => {
    mockRequireSessionOrRedirect.mockReset();
    mockListExpenses.mockReset();
  });

  it("resolves the session first, then renders that session's scoped expense list (fecha, categoria, descripcion, monto)", async () => {
    mockRequireSessionOrRedirect.mockResolvedValue(SESSION);
    mockListExpenses.mockResolvedValue({ data: [EXPENSE], page: 1, pageSize: 20, total: 1 });

    render(await EgresosPage({ searchParams: Promise.resolve({}) }));

    expect(mockListExpenses).toHaveBeenCalledWith(SESSION, { page: 1, pageSize: 20 });
    expect(screen.getByText("2026-07-06")).toBeInTheDocument();
    expect(screen.getByText("Otro")).toBeInTheDocument();
    expect(screen.getByText("Papeleria")).toBeInTheDocument();
  });

  it("passes the page search param through to the service", async () => {
    mockRequireSessionOrRedirect.mockResolvedValue(SESSION);
    mockListExpenses.mockResolvedValue({ data: [], page: 2, pageSize: 20, total: 0 });

    render(await EgresosPage({ searchParams: Promise.resolve({ page: "2" }) }));

    expect(mockListExpenses).toHaveBeenCalledWith(SESSION, { page: 2, pageSize: 20 });
  });

  it("shows an empty state when there are no expenses", async () => {
    mockRequireSessionOrRedirect.mockResolvedValue(SESSION);
    mockListExpenses.mockResolvedValue({ data: [], page: 1, pageSize: 20, total: 0 });

    render(await EgresosPage({ searchParams: Promise.resolve({}) }));

    expect(screen.getByText(/no se encontraron egresos/i)).toBeInTheDocument();
  });

  it("redirects to /login instead of ever calling listExpenses when there is no valid session (defense in depth)", async () => {
    mockRequireSessionOrRedirect.mockRejectedValue(
      Object.assign(new Error("NEXT_REDIRECT"), { digest: "NEXT_REDIRECT;replace;/login;307;" }),
    );

    await expect(EgresosPage({ searchParams: Promise.resolve({}) })).rejects.toMatchObject({
      digest: expect.stringContaining("NEXT_REDIRECT"),
    });
    expect(mockListExpenses).not.toHaveBeenCalled();
  });

  it("eventually renders the lazily-loaded 'Registrar egreso' trigger", async () => {
    mockRequireSessionOrRedirect.mockResolvedValue(SESSION);
    mockListExpenses.mockResolvedValue({ data: [], page: 1, pageSize: 20, total: 0 });

    render(await EgresosPage({ searchParams: Promise.resolve({}) }));

    expect(await screen.findByRole("button", { name: /registrar egreso/i })).toBeInTheDocument();
  });
});
