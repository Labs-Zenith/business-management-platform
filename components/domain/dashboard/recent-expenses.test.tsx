import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { formatCOP } from "@/lib/money";
import type { Expense, Session } from "@/lib/services/ports";
import type { DashboardPeriod } from "@/lib/services/dashboard-period";

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
  categoryId: "c2000000-0000-4000-8000-000000000001",
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
  categoryId: "c2000000-0000-4000-8000-000000000002",
  expenseDate: "2026-07-06",
  description: "Papeleria",
  amount: 45_000,
  notes: null,
  createdAt: "2026-07-06T00:00:00.000Z",
  updatedAt: "2026-07-06T00:00:00.000Z",
};

// A literal rather than `parsePeriodParam(...)` so the rendered heading stays
// fixed no matter when the suite runs. The component only reads `label`.
const PERIOD: DashboardPeriod = {
  key: "2026-07",
  preset: "month",
  label: "Julio 2026",
  from: "2026-07-01",
  to: "2026-07-31",
  chartMonths: ["2026-07"],
};

describe("RecentExpenses", () => {
  beforeEach(() => {
    mockRequireSession.mockReset();
    mockGetRecentExpenses.mockReset();
    mockRequireSession.mockResolvedValue(SESSION);
  });

  it('renders the empty state for a selected month ("No registraste egresos en julio 2026.")', async () => {
    mockGetRecentExpenses.mockResolvedValue([]);

    render(await RecentExpenses({ period: PERIOD }));

    expect(screen.getByText("No registraste egresos en julio 2026.")).toBeInTheDocument();
  });

  it('renders the empty state for the rolling 30-day window with its article ("... en los últimos 30 días.")', async () => {
    mockGetRecentExpenses.mockResolvedValue([]);

    const last30: DashboardPeriod = {
      key: "last30",
      preset: "last30",
      label: "Últimos 30 días",
      from: "2026-07-02",
      to: "2026-07-31",
      chartMonths: ["2026-07"],
    };
    render(await RecentExpenses({ period: last30 }));

    // `period.label` alone ("Últimos 30 días") reads broken mid-sentence
    // ("... en últimos 30 días."); `periodRangeLabel` adds the article this
    // preset needs — see `lib/services/dashboard-period.ts`.
    expect(screen.getByText("No registraste egresos en los últimos 30 días.")).toBeInTheDocument();
  });

  it("renders a populated table with the exact accented category label and formatted money", async () => {
    mockGetRecentExpenses.mockResolvedValue([NOMINA_EXPENSE, OTRO_EXPENSE]);

    render(await RecentExpenses({ period: PERIOD }));

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

    render(await RecentExpenses({ period: PERIOD }));

    expect(screen.getByText("Categoría")).toBeInTheDocument();
    expect(screen.getByText("Descripción")).toBeInTheDocument();
  });
});
