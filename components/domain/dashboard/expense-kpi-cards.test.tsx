import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { formatCOP } from "@/lib/money";
import type { Session } from "@/lib/services/ports";

const mockRequireSession = vi.fn<() => Promise<Session>>();
const mockGetExpensesTotalThisMonth = vi.fn<() => Promise<number>>();

vi.mock("@/lib/mock/cookie-persistence", () => ({
  loadStoreFromCookie: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/session", () => ({
  requireSession: () => mockRequireSession(),
}));

vi.mock("@/lib/services/expense-dashboard-service", () => ({
  getExpensesTotalThisMonth: () => mockGetExpensesTotalThisMonth(),
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

describe("ExpenseKpiCards", () => {
  beforeEach(() => {
    mockRequireSession.mockReset();
    mockGetExpensesTotalThisMonth.mockReset();
    mockRequireSession.mockResolvedValue(SESSION);
  });

  it("renders the total-this-month figure formatted as COP", async () => {
    mockGetExpensesTotalThisMonth.mockResolvedValue(1_250_000);

    render(await ExpenseKpiCards());

    expect(screen.getByText("Egresos del mes")).toBeInTheDocument();
    expect(screen.getByText(normalizeMoney(formatCOP(1_250_000)))).toBeInTheDocument();
  });

  it("renders a zero amount instead of hiding the card", async () => {
    mockGetExpensesTotalThisMonth.mockResolvedValue(0);

    render(await ExpenseKpiCards());

    expect(screen.getByText(normalizeMoney(formatCOP(0)))).toBeInTheDocument();
  });
});
