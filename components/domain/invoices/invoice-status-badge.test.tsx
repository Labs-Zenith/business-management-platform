import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { InvoiceStatusBadge } from "./invoice-status-badge";

describe("InvoiceStatusBadge", () => {
  it("renders the Spanish label for each status, unchanged", () => {
    render(<InvoiceStatusBadge status="pending" />);
    expect(screen.getByText("Pendiente")).toBeInTheDocument();
  });

  it("gives 'pending' its own amber (--chart-5) treatment, distinct from 'partially_paid'", () => {
    render(<InvoiceStatusBadge status="pending" />);
    expect(screen.getByText("Pendiente")).toHaveClass("text-chart-5", "bg-chart-5/15");
  });

  it("gives 'partially_paid' a blue (--chart-2) treatment", () => {
    render(<InvoiceStatusBadge status="partially_paid" />);
    expect(screen.getByText("Parcialmente pagada")).toHaveClass("text-chart-2", "bg-chart-2/15");
  });

  it("gives 'paid' a teal (--chart-1) treatment", () => {
    render(<InvoiceStatusBadge status="paid" />);
    expect(screen.getByText("Pagada")).toHaveClass("text-chart-1", "bg-chart-1/15");
  });

  it("gives 'overdue' the destructive (red) treatment", () => {
    render(<InvoiceStatusBadge status="overdue" />);
    expect(screen.getByText("Vencida")).toHaveClass("text-destructive", "bg-destructive/10");
  });
});
