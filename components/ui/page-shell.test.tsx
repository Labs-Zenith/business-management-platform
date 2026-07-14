import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { PageShell } from "./page-shell";

describe("PageShell", () => {
  it("renders children inside the shared page container", () => {
    render(
      <PageShell>
        <p>Contenido</p>
      </PageShell>,
    );

    expect(screen.getByText("Contenido")).toBeInTheDocument();
  });

  it("sets data-slot='page-shell' for styling/testing consistency", () => {
    render(
      <PageShell>
        <p>Contenido</p>
      </PageShell>,
    );

    expect(screen.getByText("Contenido").parentElement).toHaveAttribute("data-slot", "page-shell");
  });

  it("merges a caller-provided className with the default container classes", () => {
    render(
      <PageShell className="custom-class">
        <p>Contenido</p>
      </PageShell>,
    );

    const shell = screen.getByText("Contenido").parentElement;
    expect(shell).toHaveClass("custom-class");
    expect(shell).toHaveClass("mx-auto");
    expect(shell).toHaveClass("max-w-6xl");
  });
});
