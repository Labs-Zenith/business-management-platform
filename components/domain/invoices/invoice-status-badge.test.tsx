import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { InvoiceStatusBadge } from "./invoice-status-badge";

describe("InvoiceStatusBadge", () => {
  it("renders the Spanish label for each status, unchanged", () => {
    render(<InvoiceStatusBadge status="pending" />);
    expect(screen.getByText("Pendiente")).toBeInTheDocument();
  });

  it("gives 'pending' its own warning treatment, distinct from 'partially_paid'", () => {
    render(<InvoiceStatusBadge status="pending" />);
    expect(screen.getByText("Pendiente")).toHaveClass("text-warning", "bg-warning/15");
  });

  it("gives 'partially_paid' an info treatment", () => {
    render(<InvoiceStatusBadge status="partially_paid" />);
    expect(screen.getByText("Parcialmente pagada")).toHaveClass("text-info", "bg-info/15");
  });

  it("gives 'paid' a success treatment", () => {
    render(<InvoiceStatusBadge status="paid" />);
    expect(screen.getByText("Pagada")).toHaveClass("text-success", "bg-success/15");
  });

  it("gives 'overdue' the destructive (red) treatment", () => {
    render(<InvoiceStatusBadge status="overdue" />);
    expect(screen.getByText("Vencida")).toHaveClass("text-destructive", "bg-destructive/10");
  });
});
