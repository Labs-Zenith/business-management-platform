import { describe, expect, it } from "vitest";
import { buildSortHref, parseSortParams, toggleSort, type Sort } from "./sort";

/**
 * `lib/sort.ts` — the URL half of column sorting. Href assertions are exact
 * strings, mirroring `components/domain/table-pagination.test.tsx`'s
 * treatment of `buildPageHref`.
 */

const INVOICE_KEYS = ["number", "issueDate", "total", "status"] as const;
type InvoiceKey = (typeof INVOICE_KEYS)[number];
const INVOICE_DEFAULT: Sort<InvoiceKey> = { sortBy: "issueDate", sortDir: "desc" };

describe("parseSortParams", () => {
  it("returns the fallback when no params are present", () => {
    expect(parseSortParams(undefined, undefined, INVOICE_KEYS, INVOICE_DEFAULT)).toEqual(INVOICE_DEFAULT);
  });

  it("accepts a whitelisted column with either direction", () => {
    expect(parseSortParams("total", "asc", INVOICE_KEYS, INVOICE_DEFAULT)).toEqual({
      sortBy: "total",
      sortDir: "asc",
    });
    expect(parseSortParams("number", "desc", INVOICE_KEYS, INVOICE_DEFAULT)).toEqual({
      sortBy: "number",
      sortDir: "desc",
    });
  });

  it("discards the direction too when the column is unknown", () => {
    // The whole fallback, not {sortBy: "issueDate", sortDir: "asc"} — honoring
    // half of an unparseable request would sort by a column nobody asked for.
    expect(parseSortParams("dropTable", "asc", INVOICE_KEYS, INVOICE_DEFAULT)).toEqual(INVOICE_DEFAULT);
  });

  it("keeps a valid column but falls back on a garbage direction", () => {
    expect(parseSortParams("total", "sideways", INVOICE_KEYS, INVOICE_DEFAULT)).toEqual({
      sortBy: "total",
      sortDir: "desc",
    });
  });

  it("treats an empty sort param as absent", () => {
    expect(parseSortParams("", "asc", INVOICE_KEYS, INVOICE_DEFAULT)).toEqual({
      sortBy: "issueDate",
      sortDir: "asc",
    });
  });
});

describe("toggleSort", () => {
  it("applies the column's own first-click direction when switching columns", () => {
    const current: Sort<InvoiceKey> = { sortBy: "issueDate", sortDir: "desc" };
    expect(toggleSort("number", "asc", current)).toEqual({ sortBy: "number", sortDir: "asc" });
    expect(toggleSort("total", "desc", current)).toEqual({ sortBy: "total", sortDir: "desc" });
  });

  it("flips the direction when the column is already active, ignoring firstDir", () => {
    expect(toggleSort("total", "desc", { sortBy: "total", sortDir: "desc" })).toEqual({
      sortBy: "total",
      sortDir: "asc",
    });
    expect(toggleSort("total", "desc", { sortBy: "total", sortDir: "asc" })).toEqual({
      sortBy: "total",
      sortDir: "desc",
    });
  });
});

describe("buildSortHref", () => {
  const options = {
    sortParam: "sort",
    dirParam: "dir",
    pageParam: "page",
    defaultSort: INVOICE_DEFAULT,
  };

  it("preserves the live filters and drops the page param", () => {
    const href = buildSortHref(
      "/invoices",
      { customerId: "c1", status: "paid", page: "4", sort: "issueDate", dir: "desc" },
      { ...options, next: { sortBy: "total", sortDir: "asc" } },
    );

    // page=4 is gone: page 4 of a total-sorted list holds different rows.
    expect(href).toBe("/invoices?customerId=c1&status=paid&sort=total&dir=asc");
  });

  it("omits both sort params when the target is the entity default", () => {
    const href = buildSortHref(
      "/invoices",
      { status: "paid", sort: "total", dir: "asc" },
      { ...options, next: INVOICE_DEFAULT },
    );

    expect(href).toBe("/invoices?status=paid");
  });

  it("returns a bare pathname when nothing survives", () => {
    expect(
      buildSortHref("/invoices", { sort: "total", dir: "asc", page: "2" }, { ...options, next: INVOICE_DEFAULT }),
    ).toBe("/invoices");
  });

  it("skips undefined and empty param values", () => {
    const href = buildSortHref(
      "/invoices",
      { customerId: undefined, status: "", from: "2026-01-01" },
      { ...options, next: { sortBy: "number", sortDir: "asc" } },
    );

    expect(href).toBe("/invoices?from=2026-01-01&sort=number&dir=asc");
  });

  it("only strips its OWN namespaced params, leaving the sibling table's state intact", () => {
    // /nomina renders two independently sorted tables on one route.
    const href = buildSortHref(
      "/nomina",
      {
        tab: "empleados",
        employeesPage: "3",
        employeesSort: "name",
        employeesDir: "asc",
        paymentsPage: "2",
        paymentsSort: "amount",
        paymentsDir: "desc",
      },
      {
        sortParam: "employeesSort",
        dirParam: "employeesDir",
        pageParam: "employeesPage",
        defaultSort: { sortBy: "name", sortDir: "asc" },
        next: { sortBy: "baseSalary", sortDir: "desc" },
      },
    );

    expect(href).toBe(
      "/nomina?tab=empleados&paymentsPage=2&paymentsSort=amount&paymentsDir=desc&employeesSort=baseSalary&employeesDir=desc",
    );
  });
});
