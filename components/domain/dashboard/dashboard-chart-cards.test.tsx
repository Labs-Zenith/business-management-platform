import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import type { DashboardCharts } from "@/lib/services/dashboard-service";
import { DashboardChartCards } from "./dashboard-chart-cards";

/**
 * recharts renders to SVG in jsdom, which is limited, so these assertions
 * focus on card titles, empty-state branches, and that the non-empty branch
 * renders without throwing given real data — not on inspecting rendered SVG
 * internals, mirroring `expense-chart-cards.test.tsx`'s convention.
 */

const RECEIVABLES: DashboardCharts["receivablesByStatus"] = [
  { status: "pending", label: "Pendiente", count: 1, balance: 100_000, total: 100_000 },
  { status: "partially_paid", label: "Parcial", count: 1, balance: 40_000, total: 60_000 },
  { status: "paid", label: "Pagada", count: 1, balance: 0, total: 80_000 },
  { status: "overdue", label: "Vencida", count: 1, balance: 50_000, total: 50_000 },
];

const DEBTORS: DashboardCharts["topDebtorBalances"] = [
  { id: "c1", name: "Cliente 1", balance: 150_000 },
  { id: "c2", name: "Cliente 2", balance: 40_000 },
];

const MONTHLY_PAYMENTS: DashboardCharts["monthlyPayments"] = [
  { month: "2026-05", label: "may", amount: 0 },
  { month: "2026-06", label: "jun", amount: 100_000 },
  { month: "2026-07", label: "jul", amount: 250_000 },
];

const MONTHLY_INVOICED: DashboardCharts["monthlyInvoiced"] = [
  { month: "2026-05", label: "may", amount: 0 },
  { month: "2026-06", label: "jun", amount: 150_000 },
  { month: "2026-07", label: "jul", amount: 300_000 },
];

const ZERO_RECEIVABLES: DashboardCharts["receivablesByStatus"] = [
  { status: "pending", label: "Pendiente", count: 0, balance: 0, total: 0 },
  { status: "partially_paid", label: "Parcial", count: 0, balance: 0, total: 0 },
  { status: "paid", label: "Pagada", count: 0, balance: 0, total: 0 },
  { status: "overdue", label: "Vencida", count: 0, balance: 0, total: 0 },
];

function charts(overrides: Partial<DashboardCharts> = {}): DashboardCharts {
  return {
    receivablesByStatus: RECEIVABLES,
    topDebtorBalances: DEBTORS,
    monthlyPayments: MONTHLY_PAYMENTS,
    monthlyInvoiced: MONTHLY_INVOICED,
    ...overrides,
  };
}

describe("DashboardChartCards", () => {
  it("renders the 2 remaining chart cards with data", () => {
    render(<DashboardChartCards charts={charts()} />);

    expect(screen.getByText("Pendiente por cobrar por estado")).toBeInTheDocument();
    expect(screen.getByText("Mayores deudores")).toBeInTheDocument();
    expect(screen.queryByText("Sin facturas para graficar.")).not.toBeInTheDocument();
    expect(screen.queryByText("Sin saldos pendientes.")).not.toBeInTheDocument();
  });

  it("no longer renders the Facturado vs Cobrado card", () => {
    render(<DashboardChartCards charts={charts()} />);

    expect(screen.queryByText("Facturado vs Cobrado por mes")).not.toBeInTheDocument();
    expect(screen.queryByText("Facturado")).not.toBeInTheDocument();
    expect(screen.queryByText("Cobrado")).not.toBeInTheDocument();
  });

  it("renders a short description under each remaining chart title", () => {
    render(<DashboardChartCards charts={charts()} />);

    expect(
      screen.getByText("Cuánto te deben tus clientes, agrupado por el estado de la factura."),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Clientes que más te deben (saldo pendiente) — no los que más han comprado."),
    ).toBeInTheDocument();
  });

  it("excludes the Pagada bar from pendiente por cobrar por estado (always $0 balance)", () => {
    render(<DashboardChartCards charts={charts()} />);

    expect(screen.queryByText("Pagada")).not.toBeInTheDocument();
  });

  it("shows the empty state for pendiente por cobrar por estado when every non-paid status total is 0", () => {
    render(<DashboardChartCards charts={charts({ receivablesByStatus: ZERO_RECEIVABLES })} />);

    expect(screen.getByText("Sin facturas para graficar.")).toBeInTheDocument();
  });

  it("shows the empty state for mayores deudores when there are no debtors", () => {
    render(<DashboardChartCards charts={charts({ topDebtorBalances: [] })} />);

    expect(screen.getByText("Sin saldos pendientes.")).toBeInTheDocument();
  });
});
