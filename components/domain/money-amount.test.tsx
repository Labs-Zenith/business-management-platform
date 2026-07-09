import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MoneyAmount } from "./money-amount";

describe("MoneyAmount", () => {
  it("renders the amount formatted as COP currency via formatCOP", () => {
    render(<MoneyAmount cents={500000} />);
    expect(screen.getByText("$ 5.000")).toBeInTheDocument();
  });

  it("applies the Geist Mono tabular-nums treatment regardless of size", () => {
    render(<MoneyAmount cents={500000} />);
    expect(screen.getByText("$ 5.000")).toHaveClass("font-mono", "tabular-nums");
  });

  it("defaults to the compact 'sm' treatment for table cells and list rows", () => {
    render(<MoneyAmount cents={500000} />);
    expect(screen.getByText("$ 5.000")).toHaveClass("text-sm", "font-medium");
  });

  it("renders a larger, bolder 'lg' treatment for hero figures", () => {
    render(<MoneyAmount cents={500000} size="lg" />);
    expect(screen.getByText("$ 5.000")).toHaveClass("text-2xl", "font-semibold");
  });

  it("merges an extra className onto the root span", () => {
    render(<MoneyAmount cents={0} className="text-destructive" />);
    expect(screen.getByText("$ 0")).toHaveClass("text-destructive");
  });
});
