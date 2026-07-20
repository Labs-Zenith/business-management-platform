import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import type { ExpensesByCategoryDatum, ExpensesByMonthDatum } from "@/lib/services/expense-dashboard-service";
import { ExpenseChartCards } from "./expense-chart-cards";

/**
 * Mirrors the (currently non-existent) `dashboard-chart-cards.test.tsx`
 * convention informally: recharts renders to SVG in jsdom, which is limited,
 * so these assertions focus on card titles, empty-state branches, and that
 * the non-empty branch renders without throwing given real data — not on
 * inspecting rendered SVG internals.
 */

const BY_CATEGORY: ExpensesByCategoryDatum[] = [
  { category: "nomina", label: "Nómina", total: 500_000 },
  { category: "otro", label: "Otro", total: 320_000 },
];

const BY_MONTH: ExpensesByMonthDatum[] = [
  { month: "2026-05", label: "may", amount: 0 },
  { month: "2026-06", label: "jun", amount: 100_000 },
  { month: "2026-07", label: "jul", amount: 250_000 },
];

const ZERO_BY_CATEGORY: ExpensesByCategoryDatum[] = [
  { category: "nomina", label: "Nómina", total: 0 },
  { category: "otro", label: "Otro", total: 0 },
];

const ZERO_BY_MONTH: ExpensesByMonthDatum[] = [
  { month: "2026-05", label: "may", amount: 0 },
  { month: "2026-06", label: "jun", amount: 0 },
  { month: "2026-07", label: "jul", amount: 0 },
];

describe("ExpenseChartCards", () => {
  it("renders both chart cards with data", () => {
    render(<ExpenseChartCards charts={{ byCategory: BY_CATEGORY, byMonth: BY_MONTH }} />);

    expect(screen.getByText("Egresos por categoría")).toBeInTheDocument();
    expect(screen.getByText("Egresos por mes")).toBeInTheDocument();
    expect(screen.getByText("En qué se va el dinero, por tipo de egreso.")).toBeInTheDocument();
    expect(screen.getByText("Total de egresos de cada mes.")).toBeInTheDocument();
    expect(screen.queryByText("Sin egresos para graficar.")).not.toBeInTheDocument();
    expect(screen.queryByText("Sin egresos en los últimos meses.")).not.toBeInTheDocument();
  });

  it("shows the empty state for gastos por categoria when every category total is 0", () => {
    render(<ExpenseChartCards charts={{ byCategory: ZERO_BY_CATEGORY, byMonth: BY_MONTH }} />);

    expect(screen.getByText("Sin egresos para graficar.")).toBeInTheDocument();
  });

  it("shows the empty state for gastos por mes when no month has amount > 0", () => {
    render(<ExpenseChartCards charts={{ byCategory: BY_CATEGORY, byMonth: ZERO_BY_MONTH }} />);

    expect(screen.getByText("Sin egresos en los últimos meses.")).toBeInTheDocument();
  });
});
