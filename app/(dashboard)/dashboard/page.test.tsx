import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { DashboardPeriod } from "@/lib/services/dashboard-period";

// Every data-fetching section is mocked to a trivial marker component. This
// page test's job is the page's own structure — one `<Tabs>`, no section
// headings, the header controls, the hidden filter form, `keepMounted` on
// both `TabsPanel`s, and that `?period=`/`?tab=` reach the sections and the
// tab default — not each section's own data-fetching, which lives in
// `lib/services/*` and is unit-tested there. Sections that need to prove
// `period` propagation stamp it onto a `data-period` attribute.

const mockGetPeriodOptions = vi.fn();

vi.mock("@/lib/mock/cookie-persistence", () => ({
  loadStoreFromCookie: vi.fn().mockResolvedValue(undefined),
}));
// The session object is inlined rather than referenced from a const: `vi.mock`
// factories are hoisted above every top-level declaration in this file.
vi.mock("@/lib/session", () => ({
  requireSessionOrRedirect: vi.fn().mockResolvedValue({
    userId: "20000000-0000-4000-8000-000000000001",
    businessId: "10000000-0000-4000-8000-000000000001",
    email: "demo@negociodemo.test",
    role: "admin",
  }),
}));
// The header's month list is data-driven, so the page awaits it before
// rendering. Stubbed here to keep this test about structure.
vi.mock("@/lib/services/dashboard-period-options", () => ({
  getPeriodOptions: () => mockGetPeriodOptions(),
}));

vi.mock("@/components/domain/dashboard/kpi-cards", () => ({
  KpiCards: ({ period }: { period: DashboardPeriod }) => (
    <div data-testid="ingresos-kpi" data-period={period.key}>
      Ingresos KPI
    </div>
  ),
  KpiCardsSkeleton: () => null,
}));
vi.mock("@/components/domain/dashboard/dashboard-charts", () => ({
  DashboardCharts: ({ period }: { period: DashboardPeriod }) => (
    <div data-testid="ingresos-charts" data-period={period.key}>
      Ingresos Charts
    </div>
  ),
  DashboardChartsSkeleton: () => null,
}));
vi.mock("@/components/domain/dashboard/overdue-list", () => ({
  OverdueList: () => <div data-testid="ingresos-overdue">Overdue</div>,
  OverdueListSkeleton: () => null,
}));
vi.mock("@/components/domain/dashboard/top-debtors", () => ({
  TopDebtors: () => <div data-testid="ingresos-top-debtors">Top Debtors</div>,
  TopDebtorsSkeleton: () => null,
}));
vi.mock("@/components/domain/dashboard/recent-payments", () => ({
  RecentPayments: ({ period }: { period: DashboardPeriod }) => (
    <div data-testid="ingresos-recent-payments" data-period={period.key}>
      Ingresos Recent Payments
    </div>
  ),
  RecentPaymentsSkeleton: () => null,
}));
vi.mock("@/components/domain/dashboard/expense-kpi-cards", () => ({
  ExpenseKpiCards: ({ period }: { period: DashboardPeriod }) => (
    <div data-testid="egresos-kpi" data-period={period.key}>
      Egresos KPI
    </div>
  ),
  ExpenseKpiCardsSkeleton: () => null,
}));
vi.mock("@/components/domain/dashboard/expense-charts", () => ({
  ExpenseCharts: () => <div data-testid="egresos-charts">Egresos Charts</div>,
  ExpenseChartsSkeleton: () => null,
}));
vi.mock("@/components/domain/dashboard/recent-expenses", () => ({
  RecentExpenses: () => <div data-testid="egresos-recent">Egresos Recent</div>,
  RecentExpensesSkeleton: () => null,
}));
import DashboardPage from "./page";

/** The page is an async Server Component, so it is awaited before rendering. */
function renderPage(searchParams: { period?: string; tab?: string } = {}) {
  return DashboardPage({ searchParams: Promise.resolve(searchParams) });
}

beforeEach(() => {
  mockGetPeriodOptions.mockReset();
  mockGetPeriodOptions.mockResolvedValue({
    presets: [{ value: "last30", label: "Últimos 30 días" }],
    months: [{ value: "2026-07", label: "Julio 2026" }],
  });
});

describe("DashboardPage (single Tabs, no section split)", () => {
  it("renders both the Ingresos and Egresos panel content simultaneously on initial render (keepMounted)", async () => {
    render(await renderPage());

    // Ingresos is active by default, but Egresos content must ALSO be in the
    // DOM (not unmounted): it proves switching tabs cannot lose server-streamed
    // content.
    expect(screen.getByTestId("ingresos-kpi")).toBeInTheDocument();
    expect(screen.getByTestId("ingresos-charts")).toBeInTheDocument();
    expect(screen.getByTestId("ingresos-overdue")).toBeInTheDocument();
    expect(screen.getByTestId("ingresos-top-debtors")).toBeInTheDocument();
    expect(screen.getByTestId("ingresos-recent-payments")).toBeInTheDocument();

    expect(screen.getByTestId("egresos-kpi")).toBeInTheDocument();
    expect(screen.getByTestId("egresos-charts")).toBeInTheDocument();
    expect(screen.getByTestId("egresos-recent")).toBeInTheDocument();
  });

  it("shows the Ingresos tab as active and the Egresos tab as inactive by default", async () => {
    render(await renderPage());

    expect(screen.getByRole("tab", { name: "Ingresos" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "Egresos" })).toHaveAttribute("aria-selected", "false");
  });

  it("switches the active tab on click without unmounting the inactive panel's content", async () => {
    const { default: userEvent } = await import("@testing-library/user-event");
    const user = userEvent.setup();
    render(await renderPage());

    await user.click(screen.getByRole("tab", { name: "Egresos" }));

    expect(screen.getByRole("tab", { name: "Egresos" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByTestId("ingresos-kpi")).toBeInTheDocument();
    expect(screen.getByTestId("egresos-kpi")).toBeInTheDocument();
  });

  it("puts every Ingresos section — including the 4-card KPI row — inside the Ingresos TabsPanel, not outside the tabs", async () => {
    render(await renderPage());

    for (const testId of [
      "ingresos-kpi",
      "ingresos-charts",
      "ingresos-overdue",
      "ingresos-top-debtors",
      "ingresos-recent-payments",
    ]) {
      expect(screen.getByTestId(testId).closest('[data-slot="tabs-panel"]')).not.toBeNull();
    }
  });

  it("renders no section headings — the old 'Cobros pendientes'/'Últimos 30 días' split is gone", async () => {
    render(await renderPage());

    expect(screen.queryByRole("heading", { name: "Cobros pendientes" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Últimos 30 días" })).not.toBeInTheDocument();
    // "Dashboard" (the PageHeader title) remains the only heading on screen.
    expect(screen.getByRole("heading", { name: "Dashboard" })).toBeInTheDocument();
  });

  it("is view-only: no Crear cliente/Crear factura/Crear gasto quick actions remain", async () => {
    render(await renderPage());

    expect(screen.queryByRole("button", { name: "Crear cliente" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Crear factura" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Crear gasto" })).not.toBeInTheDocument();
  });
});

describe("DashboardPage (period selector + filter form)", () => {
  it("renders the period menu and the export menu as the header's two actions", async () => {
    render(await renderPage());

    expect(screen.getByRole("button", { name: /últimos 30 días/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /exportar/i })).toBeInTheDocument();
  });

  it("renders the empty GET filter form that the period menu and the hidden tab input submit through", async () => {
    const { container } = render(await renderPage());

    const form = container.querySelector("form#dashboard-filters");
    expect(form).not.toBeNull();
    expect(form).toHaveAttribute("method", "get");
  });

  it("seeds the hidden tab input, associated with the filter form", async () => {
    const { container } = render(await renderPage());

    const tabInput = container.querySelector('input[name="tab"]');
    expect(tabInput).not.toBeNull();
    expect(tabInput).toHaveAttribute("form", "dashboard-filters");
  });

  it("honors ?period= — every period-scoped section receives the resolved period", async () => {
    // A month safely in the past regardless of when this suite runs.
    render(await renderPage({ period: "2024-01" }));

    expect(screen.getByTestId("ingresos-kpi")).toHaveAttribute("data-period", "2024-01");
    expect(screen.getByTestId("ingresos-charts")).toHaveAttribute("data-period", "2024-01");
    expect(screen.getByTestId("ingresos-recent-payments")).toHaveAttribute("data-period", "2024-01");
    expect(screen.getByTestId("egresos-kpi")).toHaveAttribute("data-period", "2024-01");
  });

  it("defaults to the last-30-days period when ?period= is absent", async () => {
    render(await renderPage());

    expect(screen.getByTestId("ingresos-kpi")).toHaveAttribute("data-period", "last30");
  });

  it("restores ?tab=egresos as the active tab on load", async () => {
    const { container } = render(await renderPage({ tab: "egresos" }));

    expect(screen.getByRole("tab", { name: "Egresos" })).toHaveAttribute("aria-selected", "true");
    expect(container.querySelector('input[name="tab"]')).toHaveValue("egresos");
  });

  it("falls back to Ingresos for an unknown ?tab= value", async () => {
    render(await renderPage({ tab: "garbage" }));

    expect(screen.getByRole("tab", { name: "Ingresos" })).toHaveAttribute("aria-selected", "true");
  });
});
