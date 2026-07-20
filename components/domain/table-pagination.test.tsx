import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { TablePagination } from "./table-pagination";

/**
 * `components/domain/table-pagination.tsx` — presentational, no `"use
 * client"`, so it's called and rendered like any sync component (mirrors the
 * page tests' `render(await Page(...))` shape, but this one is fully sync).
 */
describe("TablePagination", () => {
  it("renders Anterior/Siguiente links preserving the current filters, with the total below", () => {
    render(
      <TablePagination
        page={2}
        pageSize={20}
        total={100}
        pathname="/customers"
        params={{ q: "Ana", status: "active", page: "2" }}
        itemLabel="clientes"
      />,
    );

    // Next → page 3, preserving q/status, using "page" (default paramName).
    const nextLink = screen.getByRole("link", { name: /siguiente/i });
    expect(nextLink).toHaveAttribute("href", "/customers?q=Ana&status=active&page=3");

    // Prev → page 1, which omits `page` entirely (clean URL for page 1).
    const prevLink = screen.getByRole("link", { name: /anterior/i });
    expect(prevLink).toHaveAttribute("href", "/customers?q=Ana&status=active");

    // The total count is shown below, alongside the page context.
    expect(screen.getByText(/Página 2 de 5 · 100 clientes/)).toBeInTheDocument();
  });

  it("renders the current page as a highlighted non-link, with the other page numbers as links", () => {
    render(
      <TablePagination
        page={2}
        pageSize={20}
        total={100}
        pathname="/customers"
        params={{}}
        itemLabel="clientes"
      />,
    );

    // Current page (2) is a non-link span marked aria-current.
    const current = screen.getByText("2", { selector: "span" });
    expect(current).toHaveAttribute("aria-current", "page");

    // Page 1 is a link back to the clean URL (page param omitted).
    const pageOneLink = screen.getByRole("link", { name: "1" });
    expect(pageOneLink).toHaveAttribute("href", "/customers");

    // The page context + total still show below.
    expect(screen.getByText(/Página 2 de 5/)).toBeInTheDocument();
  });

  it("disables Anterior (no link, aria-disabled) on page 1", () => {
    render(
      <TablePagination page={1} pageSize={20} total={100} pathname="/customers" params={{}} itemLabel="clientes" />,
    );

    expect(screen.queryByRole("link", { name: /anterior/i })).not.toBeInTheDocument();
    const prev = screen.getByText(/anterior/i).closest('[aria-disabled="true"]');
    expect(prev).not.toBeNull();
  });

  it("disables Siguiente (no link, aria-disabled) on the last page", () => {
    render(
      <TablePagination page={5} pageSize={20} total={100} pathname="/customers" params={{}} itemLabel="clientes" />,
    );

    expect(screen.queryByRole("link", { name: /siguiente/i })).not.toBeInTheDocument();
    const next = screen.getByText(/siguiente/i).closest('[aria-disabled="true"]');
    expect(next).not.toBeNull();
  });

  it("renders only the count text, with no page buttons, when totalPages <= 1", () => {
    render(
      <TablePagination page={1} pageSize={20} total={5} pathname="/customers" params={{}} itemLabel="clientes" />,
    );

    expect(screen.getByText("5 clientes")).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
  });

  it("uses a custom paramName when provided, keeping other page params untouched", () => {
    render(
      <TablePagination
        page={1}
        pageSize={20}
        total={60}
        pathname="/inventario"
        paramName="productsPage"
        params={{ productsPage: undefined, movementsPage: "3", tab: "movimientos" }}
        itemLabel="productos"
      />,
    );

    const nextLink = screen.getByRole("link", { name: /siguiente/i });
    expect(nextLink).toHaveAttribute("href", "/inventario?movementsPage=3&tab=movimientos&productsPage=2");
  });
});
