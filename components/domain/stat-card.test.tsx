import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { StatCard } from "./stat-card";

describe("StatCard", () => {
  it("renders the label and value", () => {
    render(<StatCard label="Pendiente por cobrar" value="$150.000" />);

    expect(screen.getByText("Pendiente por cobrar")).toBeInTheDocument();
    expect(screen.getByText("$150.000")).toBeInTheDocument();
  });

  it("renders the value with prominent card-title typography", () => {
    render(<StatCard label="Pendiente por cobrar" value="$150.000" />);

    expect(screen.getByText("$150.000")).toHaveClass("text-card-title");
  });

  it("renders an optional icon", () => {
    render(
      <StatCard
        label="Pendiente por cobrar"
        value="$150.000"
        icon={<svg data-testid="stat-icon" />}
      />,
    );

    expect(screen.getByTestId("stat-icon")).toBeInTheDocument();
  });

  it("omits the icon slot when none is given", () => {
    render(<StatCard label="Pendiente por cobrar" value="$150.000" />);

    expect(screen.queryByTestId("stat-icon")).not.toBeInTheDocument();
  });
});
