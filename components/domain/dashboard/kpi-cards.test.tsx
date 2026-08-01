import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { formatCOP } from "@/lib/money";
import type { Session } from "@/lib/services/ports";
import type { DashboardPeriod } from "@/lib/services/dashboard-period";

const mockRequireSession = vi.fn<() => Promise<Session>>();
const mockGetPendingBalance = vi.fn<() => Promise<number>>();
const mockGetInvoicedInPeriod = vi.fn<() => Promise<number>>();
const mockGetPaidInPeriod = vi.fn<() => Promise<number>>();
const mockGetOverdueCount = vi.fn<() => Promise<number>>();

vi.mock("@/lib/mock/cookie-persistence", () => ({
  loadStoreFromCookie: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/session", () => ({
  requireSession: () => mockRequireSession(),
}));

vi.mock("@/lib/services/dashboard-service", () => ({
  getPendingBalance: () => mockGetPendingBalance(),
  getInvoicedInPeriod: () => mockGetInvoicedInPeriod(),
  getPaidInPeriod: () => mockGetPaidInPeriod(),
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

// A literal rather than `parsePeriodParam(...)` so the expected labels stay
// fixed no matter when the suite runs. The component only reads `label`.
const PERIOD: DashboardPeriod = {
  key: "2026-07",
  preset: "month",
  label: "Julio 2026",
  from: "2026-07-01",
  to: "2026-07-31",
  chartMonths: ["2026-07"],
};

describe("KpiCards", () => {
  beforeEach(() => {
    mockRequireSession.mockReset();
    mockGetPendingBalance.mockReset();
    mockGetInvoicedInPeriod.mockReset();
    mockGetPaidInPeriod.mockReset();
    mockGetOverdueCount.mockReset();
    mockRequireSession.mockResolvedValue(SESSION);
  });

  it("renders the 4 KPI cards with their formatted figures", async () => {
    mockGetPendingBalance.mockResolvedValue(2_000_000);
    mockGetInvoicedInPeriod.mockResolvedValue(1_500_000);
    mockGetPaidInPeriod.mockResolvedValue(900_000);
    mockGetOverdueCount.mockResolvedValue(3);

    render(await KpiCards({ period: PERIOD }));

    expect(screen.getByText("Pendiente por cobrar")).toBeInTheDocument();
    expect(screen.getByText(normalizeMoney(formatCOP(2_000_000)))).toBeInTheDocument();

    expect(screen.getByText("Facturado")).toBeInTheDocument();
    expect(screen.getByText(normalizeMoney(formatCOP(1_500_000)))).toBeInTheDocument();

    expect(screen.getByText("Cobrado")).toBeInTheDocument();
    expect(screen.getByText(normalizeMoney(formatCOP(900_000)))).toBeInTheDocument();

    expect(screen.getByText("Facturas vencidas")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it("renders a zero Facturado amount instead of hiding the card", async () => {
    mockGetPendingBalance.mockResolvedValue(0);
    mockGetInvoicedInPeriod.mockResolvedValue(0);
    mockGetPaidInPeriod.mockResolvedValue(0);
    mockGetOverdueCount.mockResolvedValue(0);

    render(await KpiCards({ period: PERIOD }));

    expect(screen.getByText("Facturado")).toBeInTheDocument();
    expect(screen.getAllByText(normalizeMoney(formatCOP(0))).length).toBeGreaterThan(0);
  });

  it("hints the point-in-time cards with 'hoy' and the period cards with the period label", async () => {
    mockGetPendingBalance.mockResolvedValue(0);
    mockGetInvoicedInPeriod.mockResolvedValue(0);
    mockGetPaidInPeriod.mockResolvedValue(0);
    mockGetOverdueCount.mockResolvedValue(0);

    render(await KpiCards({ period: PERIOD }));

    expect(screen.getAllByText("hoy")).toHaveLength(2);
    expect(screen.getAllByText("julio 2026")).toHaveLength(2);
  });
});
