import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { TablePagination } from "./table-pagination";

/**
 * `components/domain/table-pagination.tsx` — presentational, no `"use
 * client"`, so it's called and rendered like any sync component (mirrors the
 * page tests' `render(await Page(...))` shape, but this one is fully sync).
 */
describe("TablePagination", () => {
  it("renders page links preserving the current filters", () => {
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

    // Page 3 link (next) must preserve q/status, and use "page" (default paramName).
    const nextLink = screen.getByRole("link", { name: /siguiente/i });
    expect(nextLink).toHaveAttribute("href", "/customers?q=Ana&status=active&page=3");

    // Page 1 link (prev) omits `page` entirely (clean URL for page 1).
    const prevLink = screen.getByRole("link", { name: /anterior/i });
    expect(prevLink).toHaveAttribute("href", "/customers?q=Ana&status=active");

    expect(screen.getByText("100 clientes")).toBeInTheDocument();
  });

  it("renders the current page as a non-link with aria-current, and other numbers as links", () => {
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

    const current = screen.getByText("2", { selector: "span" });
    expect(current).toHaveAttribute("aria-current", "page");

    const pageOneLink = screen.getByRole("link", { name: "1" });
    expect(pageOneLink).toHaveAttribute("href", "/customers");
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
