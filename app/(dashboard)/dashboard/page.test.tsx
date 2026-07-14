import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

// Every data-fetching section is mocked to a trivial marker component. This
// page test's job is to prove the Ingresos/Egresos `Tabs` restructure itself
// (`keepMounted` on both `TabsPanel`s), not to re-verify each section's own
// data-fetching, which lives in `lib/services/*` and is unit-tested there —
// mirroring the "sections aren't rendered/DOM-tested individually" convention
// already established for `components/domain/dashboard/*` (no existing
// section has its own `.test.tsx`).

vi.mock("@/components/domain/dashboard/kpi-cards", () => ({
  KpiCards: () => <div data-testid="ingresos-kpi">Ingresos KPI</div>,
  KpiCardsSkeleton: () => null,
}));
vi.mock("@/components/domain/dashboard/dashboard-charts", () => ({
  DashboardCharts: () => <div data-testid="ingresos-charts">Ingresos Charts</div>,
  DashboardChartsSkeleton: () => null,
}));
vi.mock("@/components/domain/dashboard/overdue-list", () => ({
  OverdueList: () => <div data-testid="ingresos-overdue">Ingresos Overdue</div>,
  OverdueListSkeleton: () => null,
}));
vi.mock("@/components/domain/dashboard/top-debtors", () => ({
  TopDebtors: () => <div data-testid="ingresos-top-debtors">Ingresos Top Debtors</div>,
  TopDebtorsSkeleton: () => null,
}));
vi.mock("@/components/domain/dashboard/recent-payments", () => ({
  RecentPayments: () => <div data-testid="ingresos-recent-payments">Ingresos Recent Payments</div>,
  RecentPaymentsSkeleton: () => null,
}));
vi.mock("@/components/domain/dashboard/expense-kpi-cards", () => ({
  ExpenseKpiCards: () => <div data-testid="egresos-kpi">Egresos KPI</div>,
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

describe("DashboardPage (Ingresos/Egresos tabs)", () => {
  it("renders both the Ingresos and Egresos panel content simultaneously on initial render (keepMounted)", () => {
    render(<DashboardPage />);

    // Ingresos tab is active by default, but Egresos content must ALSO be
    // present in the DOM (not unmounted) because both `TabsPanel`s are
    // `keepMounted`. This is the highest-value assertion for this PR: it
    // proves switching tabs later cannot lose server-streamed content.
    expect(screen.getByTestId("ingresos-kpi")).toBeInTheDocument();
    expect(screen.getByTestId("ingresos-charts")).toBeInTheDocument();
    expect(screen.getByTestId("ingresos-overdue")).toBeInTheDocument();
    expect(screen.getByTestId("ingresos-top-debtors")).toBeInTheDocument();
    expect(screen.getByTestId("ingresos-recent-payments")).toBeInTheDocument();

    expect(screen.getByTestId("egresos-kpi")).toBeInTheDocument();
    expect(screen.getByTestId("egresos-charts")).toBeInTheDocument();
    expect(screen.getByTestId("egresos-recent")).toBeInTheDocument();
  });

  it("shows the Ingresos tab as active and the Egresos tab as inactive by default", () => {
    render(<DashboardPage />);

    expect(screen.getByRole("tab", { name: "Ingresos" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "Egresos" })).toHaveAttribute("aria-selected", "false");
  });

  it("switches the active tab on click without unmounting the inactive panel's content", async () => {
    const { default: userEvent } = await import("@testing-library/user-event");
    const user = userEvent.setup();
    render(<DashboardPage />);

    await user.click(screen.getByRole("tab", { name: "Egresos" }));

    expect(screen.getByRole("tab", { name: "Egresos" })).toHaveAttribute("aria-selected", "true");
    // The Ingresos panel content is still in the DOM (keepMounted), just hidden.
    expect(screen.getByTestId("ingresos-kpi")).toBeInTheDocument();
    expect(screen.getByTestId("egresos-kpi")).toBeInTheDocument();
  });

  it("offers the Crear cliente and Crear factura quick actions, unchanged", () => {
    render(<DashboardPage />);

    expect(screen.getByRole("button", { name: "Crear cliente" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Crear factura" })).toBeInTheDocument();
  });

  it("offers a single Exportar trigger for the full dashboard export (format picked from its dropdown)", () => {
    render(<DashboardPage />);

    expect(screen.getByRole("button", { name: /exportar/i })).toBeInTheDocument();
    // The old separate Excel/PDF buttons are gone from the header — picking
    // the format now happens inside DashboardExportMenu's dropdown, which is
    // covered by that component's own co-located test.
    expect(screen.queryByRole("button", { name: "Excel" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "PDF" })).not.toBeInTheDocument();
  });
});
