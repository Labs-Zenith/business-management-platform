import type { ReactNode } from "react";
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
vi.mock("@/components/domain/dashboard/expenses-by-category", () => ({
  ExpensesByCategory: () => <div data-testid="egresos-by-category">Egresos By Category</div>,
  ExpensesByCategorySkeleton: () => null,
}));
vi.mock("@/components/domain/dashboard/recent-expenses", () => ({
  RecentExpenses: () => <div data-testid="egresos-recent">Egresos Recent</div>,
  RecentExpensesSkeleton: () => null,
}));
vi.mock("@/components/domain/customers/customer-form-dialog", () => ({
  default: ({ trigger }: { trigger: ReactNode }) => trigger,
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
    expect(screen.getByTestId("egresos-by-category")).toBeInTheDocument();
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
});
