import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { formatCOP } from "@/lib/money";
import type { Session } from "@/lib/services/ports";
import type { ExpensesByCategoryDatum } from "@/lib/services/expense-dashboard-service";

const mockRequireSession = vi.fn<() => Promise<Session>>();
const mockGetExpensesByCategory = vi.fn<() => Promise<ExpensesByCategoryDatum[]>>();

vi.mock("@/lib/mock/cookie-persistence", () => ({
  loadStoreFromCookie: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/session", () => ({
  requireSession: () => mockRequireSession(),
}));

vi.mock("@/lib/services/expense-dashboard-service", () => ({
  getExpensesByCategory: () => mockGetExpensesByCategory(),
}));

import { ExpensesByCategory } from "./expenses-by-category";

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

describe("ExpensesByCategory", () => {
  beforeEach(() => {
    mockRequireSession.mockReset();
    mockGetExpensesByCategory.mockReset();
    mockRequireSession.mockResolvedValue(SESSION);
  });

  it("renders both Nómina and Otro rows with their respective totals", async () => {
    mockGetExpensesByCategory.mockResolvedValue([
      { category: "nomina", label: "Nómina", total: 500_000 },
      { category: "otro", label: "Otro", total: 320_000 },
    ]);

    render(await ExpensesByCategory());

    expect(screen.getByText("Nómina")).toBeInTheDocument();
    expect(screen.getByText(normalizeMoney(formatCOP(500_000)))).toBeInTheDocument();
    expect(screen.getByText("Otro")).toBeInTheDocument();
    expect(screen.getByText(normalizeMoney(formatCOP(320_000)))).toBeInTheDocument();
  });

  it("still renders a zero row for a category with no expenses, rather than omitting it", async () => {
    mockGetExpensesByCategory.mockResolvedValue([
      { category: "nomina", label: "Nómina", total: 0 },
      { category: "otro", label: "Otro", total: 0 },
    ]);

    render(await ExpensesByCategory());

    expect(screen.getByText("Nómina")).toBeInTheDocument();
    expect(screen.getByText("Otro")).toBeInTheDocument();
    expect(screen.getAllByText(normalizeMoney(formatCOP(0)))).toHaveLength(2);
  });
});
