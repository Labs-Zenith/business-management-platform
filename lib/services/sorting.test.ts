import { describe, expect, it } from "vitest";
import {
  boolKey,
  createSorter,
  customerSorter,
  enumKey,
  expenseSorter,
  invoiceSorter,
  numberKey,
  paymentSorter,
  productSorter,
  rawKey,
  sortRows,
  textKey,
  type SortKey,
} from "./sorting";
import type { CustomerWithBalance, InvoiceWithFinance, PaymentWithRefs, ProductWithStock } from "./ports";

/**
 * `lib/services/sorting.ts` — the comparator half of column sorting, shared by
 * `lib/db/*-repo.ts` and `lib/mock/*-repo.ts`.
 *
 * The most important cases here are the two invariants the repositories rely
 * on: MISSING keys sort last in BOTH directions, and ties break deterministically
 * (because `paginate` slices the array this produces).
 */

type Row = { id: string; label: string | null; n: number | null };

const rows = (...entries: Array<[string, string | null, number | null]>): Row[] =>
  entries.map(([id, label, n]) => ({ id, label, n }));

const ids = (sorted: Row[]) => sorted.map((row) => row.id);

describe("sortRows", () => {
  const byLabel = (row: Row): SortKey => textKey(row.label);
  const byN = (row: Row): SortKey => numberKey(row.n);
  const tie = (row: Row) => row.id;

  it("sorts text with Spanish collation, ignoring accents", () => {
    const input = rows(["a", "Bogotá", 0], ["b", "Ávila", 0], ["c", "alvarez", 0], ["d", "Álvarez", 0]);
    // "Álvarez" ≈ "alvarez" under sensitivity:"base", so the id tie-break
    // decides between them; both precede "Ávila" then "Bogotá".
    expect(ids(sortRows(input, byLabel, "asc", tie))).toEqual(["c", "d", "b", "a"]);
  });

  it("compares digit runs numerically so FAC-2 precedes FAC-10", () => {
    const input = rows(["a", "FAC-10", 0], ["b", "FAC-2", 0], ["c", "FAC-1", 0]);
    expect(ids(sortRows(input, byLabel, "asc", tie))).toEqual(["c", "b", "a"]);
  });

  it("keeps missing values last in BOTH directions", () => {
    const input = rows(["a", "beta", 0], ["b", null, 0], ["c", "alpha", 0], ["d", "", 0]);

    expect(ids(sortRows(input, byLabel, "asc", tie))).toEqual(["c", "a", "b", "d"]);
    // Reversing must not float the empty cells to the top.
    expect(ids(sortRows(input, byLabel, "desc", tie))).toEqual(["a", "c", "b", "d"]);
  });

  it("sorts numbers numerically, not lexicographically", () => {
    const input = rows(["a", "x", 9], ["b", "x", 100], ["c", "x", 20]);
    expect(ids(sortRows(input, byN, "asc", tie))).toEqual(["a", "c", "b"]);
    expect(ids(sortRows(input, byN, "desc", tie))).toEqual(["b", "c", "a"]);
  });

  it("breaks ties by id, identically in both directions", () => {
    const input = rows(["c", "same", 5], ["a", "same", 5], ["b", "same", 5]);
    // Direction-independent: otherwise equal rows would reshuffle between
    // requests and `paginate` would duplicate/drop them across page bounds.
    expect(ids(sortRows(input, byLabel, "asc", tie))).toEqual(["a", "b", "c"]);
    expect(ids(sortRows(input, byLabel, "desc", tie))).toEqual(["a", "b", "c"]);
  });

  it("does not mutate the input array", () => {
    const input = rows(["b", "beta", 1], ["a", "alpha", 2]);
    sortRows(input, byLabel, "asc", tie);
    expect(ids(input)).toEqual(["b", "a"]);
  });

  it("compares ISO dates lexicographically via rawKey", () => {
    const dated = [
      { id: "a", d: "2026-01-09" },
      { id: "b", d: "2026-01-10" },
      { id: "c", d: "2025-12-31" },
    ];
    const sorted = sortRows(dated, (row) => rawKey(row.d), "asc", (row) => row.id);
    expect(sorted.map((row) => row.id)).toEqual(["c", "a", "b"]);
  });
});

describe("key builders", () => {
  it("treats null, undefined and empty string as missing", () => {
    expect(textKey(null)).toEqual({ kind: "missing" });
    expect(textKey("")).toEqual({ kind: "missing" });
    expect(rawKey(undefined)).toEqual({ kind: "missing" });
    expect(numberKey(null)).toEqual({ kind: "missing" });
    expect(numberKey(Number.NaN)).toEqual({ kind: "missing" });
  });

  it("keeps zero as a real number, not missing", () => {
    expect(numberKey(0)).toEqual({ kind: "number", value: 0 });
  });

  it("ranks enum values by declared order and sends unknowns to the end", () => {
    const order = ["overdue", "pending"] as const;
    expect(enumKey("overdue", order)).toEqual({ kind: "number", value: 0 });
    expect(enumKey("pending", order)).toEqual({ kind: "number", value: 1 });
    expect(enumKey("ghost" as "overdue", order)).toEqual({ kind: "missing" });
  });

  it("ranks booleans so ascending puts true first by default", () => {
    expect(boolKey(true)).toEqual({ kind: "number", value: 0 });
    expect(boolKey(false)).toEqual({ kind: "number", value: 1 });
  });
});

describe("createSorter", () => {
  const sorter = createSorter<Row, "label" | "n">({
    keys: ["label", "n"],
    accessors: { label: (row) => textKey(row.label), n: (row) => numberKey(row.n) },
    defaultSort: { sortBy: "label", sortDir: "asc" },
    tieBreak: (row) => row.id,
  });

  it("falls back to the default sort for an empty query", () => {
    const input = rows(["a", "beta", 2], ["b", "alpha", 1]);
    expect(ids(sorter.sort(input, {}))).toEqual(["b", "a"]);
  });

  it("falls back to the default column for an unknown sortBy", () => {
    const input = rows(["a", "beta", 2], ["b", "alpha", 1]);
    expect(ids(sorter.sort(input, { sortBy: "ghost" as "label" }))).toEqual(["b", "a"]);
  });

  it("takes the default direction when only the column is given", () => {
    const input = rows(["a", "x", 2], ["b", "x", 1]);
    expect(ids(sorter.sort(input, { sortBy: "n" }))).toEqual(["b", "a"]);
  });

  it("whitelists raw params through parse", () => {
    expect(sorter.parse("n", "desc")).toEqual({ sortBy: "n", sortDir: "desc" });
    expect(sorter.parse("nope", "desc")).toEqual({ sortBy: "label", sortDir: "asc" });
  });
});

// ---------------------------------------------------------------------------
// No-regression guard: `sort(rows, {})` must reproduce, for every entity, the
// fixed ordering the repositories applied before sorting existed.
// ---------------------------------------------------------------------------

describe("entity defaults reproduce the pre-existing repository order", () => {
  it("invoices: newest issueDate first", () => {
    const invoices = [
      { id: "a", issueDate: "2026-01-01" },
      { id: "b", issueDate: "2026-03-01" },
      { id: "c", issueDate: "2026-02-01" },
    ] as InvoiceWithFinance[];

    expect(invoiceSorter.sort(invoices, {}).map((i) => i.id)).toEqual(["b", "c", "a"]);
  });

  it("customers: name ascending", () => {
    const customers = [
      { id: "a", name: "Zulema" },
      { id: "b", name: "Ana" },
      { id: "c", name: "Mateo" },
    ] as CustomerWithBalance[];

    expect(customerSorter.sort(customers, {}).map((c) => c.id)).toEqual(["b", "c", "a"]);
  });

  it("payments: newest paymentDate first", () => {
    const payments = [
      { id: "a", paymentDate: "2026-05-01" },
      { id: "b", paymentDate: "2026-05-09" },
    ] as PaymentWithRefs[];

    expect(paymentSorter.sort(payments, {}).map((p) => p.id)).toEqual(["b", "a"]);
  });

  it("products: name ascending", () => {
    const products = [
      { id: "a", name: "Tornillo" },
      { id: "b", name: "Arandela" },
    ] as ProductWithStock[];

    expect(productSorter.sort(products, {}).map((p) => p.id)).toEqual(["b", "a"]);
  });
});

describe("invoice status ordering", () => {
  it("ascending puts the most urgent status on top", () => {
    const invoices = [
      { id: "paid", status: "paid" },
      { id: "pending", status: "pending" },
      { id: "overdue", status: "overdue" },
      { id: "partial", status: "partially_paid" },
    ] as InvoiceWithFinance[];

    expect(invoiceSorter.sort(invoices, { sortBy: "status", sortDir: "asc" }).map((i) => i.id)).toEqual([
      "overdue",
      "pending",
      "partial",
      "paid",
    ]);
  });
});

describe("nullable columns across entities", () => {
  it("invoices without a due date sort last either way", () => {
    const invoices = [
      { id: "a", dueDate: "2026-02-01" },
      { id: "b", dueDate: null },
      { id: "c", dueDate: "2026-01-01" },
    ] as InvoiceWithFinance[];

    expect(invoiceSorter.sort(invoices, { sortBy: "dueDate", sortDir: "asc" }).map((i) => i.id)).toEqual([
      "c",
      "a",
      "b",
    ]);
    expect(invoiceSorter.sort(invoices, { sortBy: "dueDate", sortDir: "desc" }).map((i) => i.id)).toEqual([
      "a",
      "c",
      "b",
    ]);
  });

  it("products without a sku sort last", () => {
    const products = [
      { id: "a", sku: "SKU-2" },
      { id: "b", sku: null },
      { id: "c", sku: "SKU-10" },
    ] as ProductWithStock[];

    expect(productSorter.sort(products, { sortBy: "sku", sortDir: "asc" }).map((p) => p.id)).toEqual([
      "a",
      "c",
      "b",
    ]);
  });

  it("payments without a method sort last", () => {
    const payments = [
      { id: "a", method: "efectivo" },
      { id: "b", method: null },
      { id: "c", method: "transferencia" },
    ] as PaymentWithRefs[];

    expect(paymentSorter.sort(payments, { sortBy: "method", sortDir: "desc" }).map((p) => p.id)).toEqual([
      "c",
      "a",
      "b",
    ]);
  });
});

describe("money columns compare numerically", () => {
  it("orders COP cents by value, not by string", () => {
    const expenses = [
      { id: "a", amount: 900_00 },
      { id: "b", amount: 10_000_00 },
      { id: "c", amount: 2_000_00 },
    ] as Parameters<typeof expenseSorter.sort>[0];

    expect(expenseSorter.sort(expenses, { sortBy: "amount", sortDir: "desc" }).map((e) => e.id)).toEqual([
      "b",
      "c",
      "a",
    ]);
  });
});

describe("denormalized reference columns", () => {
  it("sorts payments by the customer name carried on the row", () => {
    const payments = [
      { id: "a", customer: { id: "1", name: "Zulema" } },
      { id: "b", customer: { id: "2", name: "Ana" } },
    ] as PaymentWithRefs[];

    expect(paymentSorter.sort(payments, { sortBy: "customerName", sortDir: "asc" }).map((p) => p.id)).toEqual([
      "b",
      "a",
    ]);
  });

  it("sorts payments by invoice number with numeric awareness", () => {
    const payments = [
      { id: "a", invoice: { id: "1", number: "FV-10" } },
      { id: "b", invoice: { id: "2", number: "FV-2" } },
    ] as PaymentWithRefs[];

    expect(paymentSorter.sort(payments, { sortBy: "invoiceNumber", sortDir: "asc" }).map((p) => p.id)).toEqual([
      "b",
      "a",
    ]);
  });
});
