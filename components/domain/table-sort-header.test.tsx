import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { Table, TableHeader, TableRow } from "@/components/ui/table";
import { TableSortHeader } from "./table-sort-header";

/**
 * Mirrors `components/domain/table-pagination.test.tsx`: presentational, no
 * `"use client"`, so it renders synchronously and the assertions are exact
 * `href` strings.
 *
 * Headers are wrapped in `<Table><TableHeader><TableRow>` because a bare
 * `<th>` outside a row is invalid markup and React warns about it.
 */

const INVOICE_DEFAULT = { sortBy: "issueDate", sortDir: "desc" } as const;

function renderHeaders(children: React.ReactNode) {
  return render(
    <Table>
      <TableHeader>
        <TableRow>{children}</TableRow>
      </TableHeader>
    </Table>,
  );
}

describe("TableSortHeader", () => {
  it("links an inactive column to its own first-click direction, dropping the page", () => {
    renderHeaders(
      <TableSortHeader
        label="Total"
        sortBy="total"
        firstDir="desc"
        current={INVOICE_DEFAULT}
        defaultSort={INVOICE_DEFAULT}
        pathname="/invoices"
        params={{ status: "paid", page: "3" }}
      />,
    );

    expect(screen.getByRole("link", { name: /total/i })).toHaveAttribute(
      "href",
      "/invoices?status=paid&sort=total&dir=desc",
    );
  });

  it("flips the direction when the column is already active", () => {
    renderHeaders(
      <TableSortHeader
        label="Total"
        sortBy="total"
        firstDir="desc"
        current={{ sortBy: "total", sortDir: "desc" }}
        defaultSort={INVOICE_DEFAULT}
        pathname="/invoices"
        params={{ sort: "total", dir: "desc" }}
      />,
    );

    expect(screen.getByRole("link", { name: /total/i })).toHaveAttribute("href", "/invoices?sort=total&dir=asc");
  });

  it("omits both params when the click lands back on the entity default", () => {
    renderHeaders(
      <TableSortHeader
        label="Fecha"
        sortBy="issueDate"
        firstDir="desc"
        current={{ sortBy: "total", sortDir: "asc" }}
        defaultSort={INVOICE_DEFAULT}
        pathname="/invoices"
        params={{ sort: "total", dir: "asc" }}
      />,
    );

    expect(screen.getByRole("link", { name: /fecha/i })).toHaveAttribute("href", "/invoices");
  });

  it("reports the sort state through aria-sort on the th", () => {
    const { rerender } = renderHeaders(
      <TableSortHeader
        label="Total"
        sortBy="total"
        current={{ sortBy: "issueDate", sortDir: "desc" }}
        defaultSort={INVOICE_DEFAULT}
        pathname="/invoices"
        params={{}}
      />,
    );
    expect(screen.getByRole("columnheader")).toHaveAttribute("aria-sort", "none");

    const rerenderWith = (sortDir: "asc" | "desc") =>
      rerender(
        <Table>
          <TableHeader>
            <TableRow>
              <TableSortHeader
                label="Total"
                sortBy="total"
                current={{ sortBy: "total", sortDir }}
                defaultSort={INVOICE_DEFAULT}
                pathname="/invoices"
                params={{}}
              />
            </TableRow>
          </TableHeader>
        </Table>,
      );

    rerenderWith("asc");
    expect(screen.getByRole("columnheader")).toHaveAttribute("aria-sort", "ascending");

    rerenderWith("desc");
    expect(screen.getByRole("columnheader")).toHaveAttribute("aria-sort", "descending");
  });

  it("announces the action a click will take, for screen readers", () => {
    renderHeaders(
      <TableSortHeader
        label="Total"
        sortBy="total"
        current={{ sortBy: "total", sortDir: "asc" }}
        defaultSort={INVOICE_DEFAULT}
        pathname="/invoices"
        params={{}}
      />,
    );

    expect(screen.getByRole("link", { name: /cambiar a descendente/i })).toBeInTheDocument();
  });

  it("keeps TableHead's base classes and adds text-right when aligned right", () => {
    renderHeaders(
      <TableSortHeader
        label="Total"
        sortBy="total"
        align="right"
        current={INVOICE_DEFAULT}
        defaultSort={INVOICE_DEFAULT}
        pathname="/invoices"
        params={{}}
      />,
    );

    // DESIGN.md forbids renaming existing utilities because tests assert them.
    const header = screen.getByRole("columnheader");
    expect(header).toHaveClass("h-10", "px-3", "text-right");
  });

  it("only strips its own namespaced params, leaving the sibling table alone", () => {
    renderHeaders(
      <TableSortHeader
        label="Nombre"
        sortBy="name"
        current={{ sortBy: "name", sortDir: "asc" }}
        defaultSort={{ sortBy: "name", sortDir: "asc" }}
        pathname="/nomina"
        sortParam="employeesSort"
        dirParam="employeesDir"
        pageParam="employeesPage"
        params={{
          tab: "empleados",
          employeesPage: "3",
          employeesSort: "name",
          employeesDir: "asc",
          paymentsPage: "2",
          paymentsSort: "amount",
          paymentsDir: "desc",
        }}
      />,
    );

    // The Pagos table's page and sort survive; only Empleados' own do not.
    expect(screen.getByRole("link", { name: /nombre/i })).toHaveAttribute(
      "href",
      "/nomina?tab=empleados&paymentsPage=2&paymentsSort=amount&paymentsDir=desc&employeesSort=name&employeesDir=desc",
    );
  });
});
