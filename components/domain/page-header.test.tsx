import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { PageHeader } from "./page-header";

describe("PageHeader", () => {
  it("renders the title as a text-headline <h1>", () => {
    render(<PageHeader title="Clientes" />);

    const heading = screen.getByRole("heading", { level: 1, name: "Clientes" });
    expect(heading).toHaveClass("text-headline");
  });

  it("renders an optional description", () => {
    render(<PageHeader title="Clientes" description="Gestiona tus clientes." />);

    expect(screen.getByText("Gestiona tus clientes.")).toBeInTheDocument();
  });

  it("omits the description paragraph when none is given", () => {
    render(<PageHeader title="Clientes" />);

    expect(screen.queryByText("Gestiona tus clientes.")).not.toBeInTheDocument();
  });

  it("renders the actions slot when given", () => {
    render(<PageHeader title="Clientes" actions={<button type="button">Crear cliente</button>} />);

    expect(screen.getByRole("button", { name: "Crear cliente" })).toBeInTheDocument();
  });

  it("renders the breadcrumb slot above the title when given", () => {
    render(<PageHeader title="INV-001" breadcrumb={<nav aria-label="breadcrumb">Facturas</nav>} />);

    expect(screen.getByRole("navigation", { name: "breadcrumb" })).toBeInTheDocument();
  });
});
