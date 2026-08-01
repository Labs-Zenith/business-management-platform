import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { formatCOP } from "@/lib/money";
import type { Session } from "@/lib/services/ports";
import type { DashboardPeriod } from "@/lib/services/dashboard-period";

const mockRequireSession = vi.fn<() => Promise<Session>>();
const mockGetExpensesTotalInPeriod = vi.fn<() => Promise<number>>();

vi.mock("@/lib/mock/cookie-persistence", () => ({
  loadStoreFromCookie: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/session", () => ({
  requireSession: () => mockRequireSession(),
}));

vi.mock("@/lib/services/expense-dashboard-service", () => ({
  getExpensesTotalInPeriod: () => mockGetExpensesTotalInPeriod(),
}));

import { ExpenseKpiCards } from "./expense-kpi-cards";

const SESSION: Session = {
  userId: "20000000-0000-4000-8000-000000000001",
  businessId: "10000000-0000-4000-8000-000000000001",
  email: "demo@negociodemo.test",
  role: "admin",
};

// `getByText`'s default normalizer collapses ALL whitespace (including
// `formatCOP`'s real NBSP) to a regular space, so the query string must be
// normalized the same way to match — see
// `app/(dashboard)/customers/[id]/page.test.tsx` for the same convention.
const normalizeMoney = (value: string) => value.replace(/ /g, " ");

// A literal rather than `parsePeriodParam(...)` so the expected label stays
// fixed no matter when the suite runs. The component only reads `label`.
const PERIOD: DashboardPeriod = {
  key: "2026-07",
  preset: "month",
  label: "Julio 2026",
  from: "2026-07-01",
  to: "2026-07-31",
  chartMonths: ["2026-07"],
};

describe("ExpenseKpiCards", () => {
  beforeEach(() => {
    mockRequireSession.mockReset();
    mockGetExpensesTotalInPeriod.mockReset();
    mockRequireSession.mockResolvedValue(SESSION);
  });

  // The period is named once, in the section heading above the tabs
  // (`app/(dashboard)/dashboard/page.tsx`), not repeated on every card.
  it("renders the period total formatted as COP", async () => {
    mockGetExpensesTotalInPeriod.mockResolvedValue(1_250_000);

    render(await ExpenseKpiCards({ period: PERIOD }));

    expect(screen.getByText("Egresos")).toBeInTheDocument();
    expect(screen.getByText(normalizeMoney(formatCOP(1_250_000)))).toBeInTheDocument();
  });

  it("renders a zero amount instead of hiding the card", async () => {
    mockGetExpensesTotalInPeriod.mockResolvedValue(0);

    render(await ExpenseKpiCards({ period: PERIOD }));

    expect(screen.getByText(normalizeMoney(formatCOP(0)))).toBeInTheDocument();
  });

  it("hints the card with the period label in lowercase", async () => {
    mockGetExpensesTotalInPeriod.mockResolvedValue(1_250_000);

    render(await ExpenseKpiCards({ period: PERIOD }));

    expect(screen.getByText("julio 2026")).toBeInTheDocument();
  });
});
