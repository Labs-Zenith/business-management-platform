import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import type { PortfolioCharts } from "@/lib/services/dashboard-service";
import { PortfolioChartCards } from "./portfolio-chart-cards";

/**
 * recharts renders to SVG in jsdom, which is limited, so these assertions
 * focus on card titles, empty-state branches, and that the non-empty branch
 * renders without throwing given real data — not on inspecting rendered SVG
 * internals, mirroring `expense-chart-cards.test.tsx`'s convention.
 */

const RECEIVABLES: PortfolioCharts["receivablesByStatus"] = [
  { status: "pending", label: "Pendiente", count: 1, balance: 100_000, total: 100_000 },
  { status: "partially_paid", label: "Parcial", count: 1, balance: 40_000, total: 60_000 },
  { status: "paid", label: "Pagada", count: 1, balance: 0, total: 80_000 },
  { status: "overdue", label: "Vencida", count: 1, balance: 50_000, total: 50_000 },
];

const DEBTORS: PortfolioCharts["topDebtorBalances"] = [
  { id: "c1", name: "Cliente 1", balance: 150_000 },
  { id: "c2", name: "Cliente 2", balance: 40_000 },
];

const ZERO_RECEIVABLES: PortfolioCharts["receivablesByStatus"] = [
  { status: "pending", label: "Pendiente", count: 0, balance: 0, total: 0 },
  { status: "partially_paid", label: "Parcial", count: 0, balance: 0, total: 0 },
  { status: "paid", label: "Pagada", count: 0, balance: 0, total: 0 },
  { status: "overdue", label: "Vencida", count: 0, balance: 0, total: 0 },
];

function charts(overrides: Partial<PortfolioCharts> = {}): PortfolioCharts {
  return {
    receivablesByStatus: RECEIVABLES,
    topDebtorBalances: DEBTORS,
    ...overrides,
  };
}

describe("PortfolioChartCards", () => {
  it("renders the 2 remaining chart cards with data", () => {
    render(<PortfolioChartCards charts={charts()} />);

    expect(screen.getByText("Por cobrar por estado")).toBeInTheDocument();
    // The debtor chart was removed: it plotted the same getTopDebtors rows
    // that `top-debtors.tsx` already lists in a table on the same screen.
    expect(screen.queryByText("Mayores deudores")).not.toBeInTheDocument();
    expect(screen.queryByText("Todavía no hay datos para esta gráfica.")).not.toBeInTheDocument();
    expect(screen.queryByText("Todavía no hay datos para esta gráfica.")).not.toBeInTheDocument();
  });

  it("no longer renders the Facturado vs Cobrado card", () => {
    render(<PortfolioChartCards charts={charts()} />);

    expect(screen.queryByText("Facturado vs Cobrado por mes")).not.toBeInTheDocument();
    expect(screen.queryByText("Facturado")).not.toBeInTheDocument();
    expect(screen.queryByText("Cobrado")).not.toBeInTheDocument();
  });

  it("renders a short description under the chart title", () => {
    render(<PortfolioChartCards charts={charts()} />);

    expect(screen.getByText("Cuánto te deben, según en qué punto va cada factura.")).toBeInTheDocument();
  });

  it("excludes the Pagada bar from pendiente por cobrar por estado (always $0 balance)", () => {
    render(<PortfolioChartCards charts={charts()} />);

    expect(screen.queryByText("Pagada")).not.toBeInTheDocument();
  });

  it("shows the empty state for pendiente por cobrar por estado when every non-paid status total is 0", () => {
    render(<PortfolioChartCards charts={charts({ receivablesByStatus: ZERO_RECEIVABLES })} />);

    expect(screen.getByText("Todavía no hay datos para esta gráfica.")).toBeInTheDocument();
  });

  it("renders nothing for debtors: that data belongs to top-debtors.tsx now", () => {
    render(<PortfolioChartCards charts={charts()} />);

    // `PortfolioCharts` still RETURNS `topDebtorBalances` — the export renders
    // its own debtor chart from it — but the screen must not plot it twice.
    for (const debtor of DEBTORS) {
      expect(screen.queryByText(debtor.name)).not.toBeInTheDocument();
    }
  });
});
