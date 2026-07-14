import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { formatCOP } from "@/lib/money";
import type { Expense, Session } from "@/lib/services/ports";

const mockRequireSession = vi.fn<() => Promise<Session>>();
const mockGetRecentExpenses = vi.fn<() => Promise<Expense[]>>();

vi.mock("@/lib/mock/cookie-persistence", () => ({
  loadStoreFromCookie: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/session", () => ({
  requireSession: () => mockRequireSession(),
}));

vi.mock("@/lib/services/expense-dashboard-service", async () => {
  const actual = await vi.importActual<typeof import("@/lib/services/expense-dashboard-service")>(
    "@/lib/services/expense-dashboard-service",
  );
  return {
    ...actual,
    getRecentExpenses: () => mockGetRecentExpenses(),
  };
});

import { RecentExpenses } from "./recent-expenses";

const SESSION: Session = {
  userId: "20000000-0000-4000-8000-000000000001",
  businessId: "10000000-0000-4000-8000-000000000001",
  email: "demo@negociodemo.test",
  role: "admin",
};

const NOMINA_EXPENSE: Expense = {
  id: "60000000-0000-4000-8000-000000000001",
  businessId: SESSION.businessId,
  category: "nomina",
  expenseDate: "2026-07-05",
  description: "Pago quincenal",
  amount: 1_500_000,
  notes: null,
  createdAt: "2026-07-05T00:00:00.000Z",
  updatedAt: "2026-07-05T00:00:00.000Z",
};

// `getByText`'s default normalizer collapses ALL whitespace (including
// `formatCOP`'s real NBSP) to a regular space, so the query string must be
// normalized the same way to match — see
// `app/(dashboard)/customers/[id]/page.test.tsx` for the same convention.
const normalizeMoney = (value: string) => value.replace(/ /g, " ");

const OTRO_EXPENSE: Expense = {
  id: "60000000-0000-4000-8000-000000000002",
  businessId: SESSION.businessId,
  category: "otro",
  expenseDate: "2026-07-06",
  description: "Papeleria",
  amount: 45_000,
  notes: null,
  createdAt: "2026-07-06T00:00:00.000Z",
  updatedAt: "2026-07-06T00:00:00.000Z",
};

describe("RecentExpenses", () => {
  beforeEach(() => {
    mockRequireSession.mockReset();
    mockGetRecentExpenses.mockReset();
    mockRequireSession.mockResolvedValue(SESSION);
  });

  it('renders the empty state ("Sin egresos registrados.") when there are no expenses', async () => {
    mockGetRecentExpenses.mockResolvedValue([]);

    render(await RecentExpenses());

    expect(screen.getByText("Sin egresos registrados.")).toBeInTheDocument();
  });

  it("renders a populated table with the exact accented category label and formatted money", async () => {
    mockGetRecentExpenses.mockResolvedValue([NOMINA_EXPENSE, OTRO_EXPENSE]);

    render(await RecentExpenses());

    // Exact text match — with the accent — so a regression back to the
    // unaccented "Nomina" duplicate-map bug fails this test immediately.
    expect(screen.getByText("Nómina")).toBeInTheDocument();
    expect(screen.queryByText("Nomina")).not.toBeInTheDocument();
    expect(screen.getByText("Otro")).toBeInTheDocument();

    expect(screen.getByText("Pago quincenal")).toBeInTheDocument();
    expect(screen.getByText(normalizeMoney(formatCOP(1_500_000)))).toBeInTheDocument();
    expect(screen.getByText("Papeleria")).toBeInTheDocument();
    expect(screen.getByText(normalizeMoney(formatCOP(45_000)))).toBeInTheDocument();
  });

  it("renders the Fecha/Categoría/Descripción/Monto column headers with correct accents", async () => {
    mockGetRecentExpenses.mockResolvedValue([]);

    render(await RecentExpenses());

    expect(screen.getByText("Categoría")).toBeInTheDocument();
    expect(screen.getByText("Descripción")).toBeInTheDocument();
  });
});
