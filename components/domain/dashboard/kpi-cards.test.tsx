import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { formatCOP } from "@/lib/money";
import type { Session } from "@/lib/services/ports";

const mockRequireSession = vi.fn<() => Promise<Session>>();
const mockGetPendingBalance = vi.fn<() => Promise<number>>();
const mockGetInvoicedThisMonth = vi.fn<() => Promise<number>>();
const mockGetPaidThisMonth = vi.fn<() => Promise<number>>();
const mockGetOverdueCount = vi.fn<() => Promise<number>>();

vi.mock("@/lib/mock/cookie-persistence", () => ({
  loadStoreFromCookie: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/session", () => ({
  requireSession: () => mockRequireSession(),
}));

vi.mock("@/lib/services/dashboard-service", () => ({
  getPendingBalance: () => mockGetPendingBalance(),
  getInvoicedThisMonth: () => mockGetInvoicedThisMonth(),
  getPaidThisMonth: () => mockGetPaidThisMonth(),
  getOverdueCount: () => mockGetOverdueCount(),
}));

import { KpiCards } from "./kpi-cards";

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

describe("KpiCards", () => {
  beforeEach(() => {
    mockRequireSession.mockReset();
    mockGetPendingBalance.mockReset();
    mockGetInvoicedThisMonth.mockReset();
    mockGetPaidThisMonth.mockReset();
    mockGetOverdueCount.mockReset();
    mockRequireSession.mockResolvedValue(SESSION);
  });

  it("renders all 4 KPI cards with their formatted figures", async () => {
    mockGetPendingBalance.mockResolvedValue(300_000);
    mockGetInvoicedThisMonth.mockResolvedValue(1_500_000);
    mockGetPaidThisMonth.mockResolvedValue(900_000);
    mockGetOverdueCount.mockResolvedValue(3);

    render(await KpiCards());

    expect(screen.getByText("Pendiente por cobrar")).toBeInTheDocument();
    expect(screen.getByText(normalizeMoney(formatCOP(300_000)))).toBeInTheDocument();

    expect(screen.getByText("Facturado este mes")).toBeInTheDocument();
    expect(screen.getByText(normalizeMoney(formatCOP(1_500_000)))).toBeInTheDocument();

    expect(screen.getByText("Pagado este mes")).toBeInTheDocument();
    expect(screen.getByText(normalizeMoney(formatCOP(900_000)))).toBeInTheDocument();

    expect(screen.getByText("Facturas vencidas")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it("renders a zero Facturado este mes amount instead of hiding the card", async () => {
    mockGetPendingBalance.mockResolvedValue(0);
    mockGetInvoicedThisMonth.mockResolvedValue(0);
    mockGetPaidThisMonth.mockResolvedValue(0);
    mockGetOverdueCount.mockResolvedValue(0);

    render(await KpiCards());

    expect(screen.getByText("Facturado este mes")).toBeInTheDocument();
    expect(screen.getAllByText(normalizeMoney(formatCOP(0))).length).toBeGreaterThan(0);
  });
});
