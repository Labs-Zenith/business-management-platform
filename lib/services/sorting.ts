/**
 * The comparator half of column sorting — imported by BOTH `lib/db/*-repo.ts`
 * and `lib/mock/*-repo.ts` so the two backends can never disagree about what
 * `?sort=balance&dir=desc` means. (`lib/sort.ts` is the URL half, used by
 * pages and presentational components; the two never import each other except
 * for the `Sort`/`SortDir` types.)
 *
 * Every repository already reads its whole business into memory and does
 * filter -> sort -> paginate in JS (see `lib/db/customer-repo.ts`'s header
 * comment), so sorting needs no SQL: each `list` swaps its hardcoded `.sort()`
 * for the entity sorter below.
 *
 * Sort keys live in `lib/services/ports.ts` next to their `*ListQuery` and are
 * imported here — never the reverse — so this module stays a leaf.
 */

import type {
  CustomerSortBy,
  CustomerWithBalance,
  EmployeeSortBy,
  Employee,
  Expense,
  ExpenseSortBy,
  InvoiceSortBy,
  InvoiceWithFinance,
  PaymentSortBy,
  PaymentWithRefs,
  PayrollPaymentSortBy,
  PayrollPaymentWithEmployee,
  ProductSortBy,
  ProductWithStock,
} from "@/lib/services/ports";
import {
  CUSTOMER_SORT_KEYS,
  EMPLOYEE_SORT_KEYS,
  EXPENSE_SORT_KEYS,
  INVOICE_SORT_KEYS,
  PAYMENT_SORT_KEYS,
  PAYROLL_PAYMENT_SORT_KEYS,
  PRODUCT_SORT_KEYS,
} from "@/lib/services/ports";
import { parseSortParams, type Sort, type SortDir } from "@/lib/sort";

/**
 * Constructed ONCE at module scope. `Intl.Collator` is expensive to build, and
 * a comparator runs O(n log n) times — instantiating per comparison would be a
 * measurable cost on a few thousand rows.
 *
 * `sensitivity: "base"` so "Alvarez" and "Álvarez" sort together (Spanish
 * names are inconsistently accented in real data); `numeric: true` so digit
 * runs compare as numbers and `FAC-2` precedes `FAC-10`.
 */
const COLLATOR = new Intl.Collator("es", { sensitivity: "base", numeric: true });

/**
 * A row's extracted sort value. Four kinds rather than one `string | number`
 * because each compares differently:
 *
 * - `missing` — null/empty. Sorts LAST in both directions (see `sortRows`).
 * - `text` — human-facing text, compared with `COLLATOR`.
 * - `raw` — plain lexicographic. Used for zero-padded ISO dates, which are
 *   ordered correctly by byte comparison. Deliberately NOT `text`: the numeric
 *   collator chunks "2026-07-08" into digit runs, which happens to work for
 *   padded dates but silently misorders any value that ever loses its padding.
 * - `number` — numeric, including money in integer COP cents.
 */
export type SortKey =
  | { kind: "missing" }
  | { kind: "text"; value: string }
  | { kind: "raw"; value: string }
  | { kind: "number"; value: number };

const MISSING: SortKey = { kind: "missing" };

export function textKey(value: string | null | undefined): SortKey {
  return value === null || value === undefined || value === "" ? MISSING : { kind: "text", value };
}

export function rawKey(value: string | null | undefined): SortKey {
  return value === null || value === undefined || value === "" ? MISSING : { kind: "raw", value };
}

export function numberKey(value: number | null | undefined): SortKey {
  return value === null || value === undefined || Number.isNaN(value) ? MISSING : { kind: "number", value };
}

/**
 * Sorts by a declared rank rather than alphabetically — for enum columns where
 * the alphabet carries no meaning to the user (an invoice status column sorted
 * "overdue, paid, partially_paid, pending" is noise; sorted by urgency it is
 * information). A value outside `order` sorts last.
 */
export function enumKey<V extends string>(value: V | null | undefined, order: readonly V[]): SortKey {
  if (value === null || value === undefined) return MISSING;
  const rank = order.indexOf(value);
  return rank === -1 ? MISSING : { kind: "number", value: rank };
}

/** Booleans as a two-value rank. `trueFirst` maps `true` to rank 0, so ascending puts "Activo" on top. */
export function boolKey(value: boolean, trueFirst = true): SortKey {
  return { kind: "number", value: value === trueFirst ? 0 : 1 };
}

export type SortAccessor<T> = (row: T) => SortKey;

/**
 * Sorts a copy of `rows`, decorate-sort-undecorate so each accessor runs once
 * per row instead of O(n log n) times.
 *
 * Two invariants carry real weight:
 *
 * 1. MISSING sorts last in BOTH directions. The missing check runs before the
 *    direction sign is applied, so flipping asc/desc never floats a screen of
 *    empty cells to the top — reversing "Vencimiento" should show the far
 *    dates first, not every invoice that has no due date.
 *
 * 2. The tie-break is unique and direction-INDEPENDENT. Callers pass a row id.
 *    This is not cosmetic: `paginate` slices the array this returns, so two
 *    rows that compare equal and swap between requests would appear twice on
 *    one page and vanish from another.
 */
export function sortRows<T>(
  rows: T[],
  accessor: SortAccessor<T>,
  dir: SortDir,
  tieBreak: (row: T) => string,
): T[] {
  const sign = dir === "asc" ? 1 : -1;
  const decorated = rows.map((row) => ({ row, key: accessor(row), tie: tieBreak(row) }));

  decorated.sort((a, b) => {
    const aMissing = a.key.kind === "missing";
    const bMissing = b.key.kind === "missing";
    if (aMissing || bMissing) {
      if (aMissing !== bMissing) return aMissing ? 1 : -1;
    } else {
      let cmp = 0;
      if (a.key.kind === "number" && b.key.kind === "number") {
        cmp = a.key.value - b.key.value;
      } else if (a.key.kind === "text" && b.key.kind === "text") {
        cmp = COLLATOR.compare(a.key.value, b.key.value);
      } else if (a.key.kind === "raw" && b.key.kind === "raw") {
        cmp = a.key.value < b.key.value ? -1 : a.key.value > b.key.value ? 1 : 0;
      }
      if (cmp !== 0) return sign * cmp;
    }
    return a.tie < b.tie ? -1 : a.tie > b.tie ? 1 : 0;
  });

  return decorated.map((entry) => entry.row);
}

/**
 * One per entity — the single object shared by the Postgres repo, the mock
 * repo, and the page, so a column can never be sortable in the URL but
 * unknown to the comparator (or ordered one way against Postgres and another
 * against the mock store).
 */
export type EntitySorter<T, K extends string> = {
  /** Every sortable column, for the page's whitelist and its header links. */
  readonly keys: readonly K[];
  /** Applied when the query carries no sort — reproduces each repo's pre-existing fixed order. */
  readonly defaultSort: Sort<K>;
  /** Called by both repo implementations, immediately before `paginate`. */
  sort(rows: T[], query: { sortBy?: K; sortDir?: SortDir }): T[];
  /** Called by the page on raw `searchParams`; whitelisted server-side. */
  parse(rawSort: string | undefined, rawDir: string | undefined): Sort<K>;
};

export function createSorter<T, K extends string>(config: {
  keys: readonly K[];
  accessors: Record<K, SortAccessor<T>>;
  defaultSort: Sort<K>;
  tieBreak: (row: T) => string;
}): EntitySorter<T, K> {
  const { keys, accessors, defaultSort, tieBreak } = config;
  return {
    keys,
    defaultSort,
    sort(rows, query) {
      // A partial query still lands on a valid pair, so callers that never
      // sort (dashboard widgets, exports, reports) keep their old ordering.
      const sortBy = query.sortBy && accessors[query.sortBy] ? query.sortBy : defaultSort.sortBy;
      const sortDir = query.sortDir ?? defaultSort.sortDir;
      return sortRows(rows, accessors[sortBy], sortDir, tieBreak);
    },
    parse(rawSort, rawDir) {
      return parseSortParams(rawSort, rawDir, keys, defaultSort);
    },
  };
}

// ---------------------------------------------------------------------------
// Entity sorters. Each `defaultSort` MUST reproduce the fixed `.sort()` the
// repository used before sorting existed — that is what makes this change a
// no-op for every caller that does not pass sort params.
// ---------------------------------------------------------------------------

/**
 * Severity order, so ascending puts what needs attention on top. Alphabetical
 * would be meaningless here. Note `status` is COMPUTED (`computeStatus` runs
 * in `withFinance` before the sort), so this orders by exactly the value the
 * badge shows — including the documented quirk that a past-due invoice with a
 * partial payment reads `partially_paid`, not `overdue`.
 */
export const INVOICE_STATUS_SORT_ORDER = ["overdue", "pending", "partially_paid", "paid"] as const;

/** Was: `invoices.sort((a, b) => (a.issueDate < b.issueDate ? 1 : -1))`. */
export const invoiceSorter = createSorter<InvoiceWithFinance, InvoiceSortBy>({
  keys: INVOICE_SORT_KEYS,
  defaultSort: { sortBy: "issueDate", sortDir: "desc" },
  tieBreak: (invoice) => invoice.id,
  accessors: {
    number: (invoice) => textKey(invoice.number),
    issueDate: (invoice) => rawKey(invoice.issueDate),
    dueDate: (invoice) => rawKey(invoice.dueDate),
    total: (invoice) => numberKey(invoice.total),
    balance: (invoice) => numberKey(invoice.balance),
    status: (invoice) => enumKey(invoice.status, INVOICE_STATUS_SORT_ORDER),
  },
});

/** Was: `customers.sort((a, b) => a.name.localeCompare(b.name))`. */
export const customerSorter = createSorter<CustomerWithBalance, CustomerSortBy>({
  keys: CUSTOMER_SORT_KEYS,
  defaultSort: { sortBy: "name", sortDir: "asc" },
  tieBreak: (customer) => customer.id,
  accessors: {
    name: (customer) => textKey(customer.name),
    phone: (customer) => textKey(customer.phone),
    balance: (customer) => numberKey(customer.balance),
    status: (customer) => boolKey(customer.isActive),
  },
});

/** Was: `payments.sort((a, b) => (a.paymentDate < b.paymentDate ? 1 : -1))`. */
export const paymentSorter = createSorter<PaymentWithRefs, PaymentSortBy>({
  keys: PAYMENT_SORT_KEYS,
  defaultSort: { sortBy: "paymentDate", sortDir: "desc" },
  tieBreak: (payment) => payment.id,
  accessors: {
    paymentDate: (payment) => rawKey(payment.paymentDate),
    // Denormalized on the row already, so no join is needed to sort by them.
    customerName: (payment) => textKey(payment.customer.name),
    invoiceNumber: (payment) => textKey(payment.invoice.number),
    amount: (payment) => numberKey(payment.amount),
    method: (payment) => textKey(payment.method),
  },
});

/** Only two categories exist today, so rank order is also label order. */
export const EXPENSE_CATEGORY_SORT_ORDER = ["nomina", "otro"] as const;

/** Was: newest-first by `expenseDate`. */
export const expenseSorter = createSorter<Expense, ExpenseSortBy>({
  keys: EXPENSE_SORT_KEYS,
  defaultSort: { sortBy: "expenseDate", sortDir: "desc" },
  tieBreak: (expense) => expense.id,
  accessors: {
    expenseDate: (expense) => rawKey(expense.expenseDate),
    category: (expense) => enumKey(expense.category, EXPENSE_CATEGORY_SORT_ORDER),
    description: (expense) => textKey(expense.description),
    amount: (expense) => numberKey(expense.amount),
  },
});

/** Was: `products.sort((a, b) => a.name.localeCompare(b.name))`. */
export const productSorter = createSorter<ProductWithStock, ProductSortBy>({
  keys: PRODUCT_SORT_KEYS,
  defaultSort: { sortBy: "name", sortDir: "asc" },
  tieBreak: (product) => product.id,
  accessors: {
    name: (product) => textKey(product.name),
    sku: (product) => textKey(product.sku),
    unitCost: (product) => numberKey(product.unitCost),
    // Derived in `withStock` — the repos sort AFTER that map so these exist.
    currentQuantity: (product) => numberKey(product.currentQuantity),
    totalValue: (product) => numberKey(product.totalValue),
    status: (product) => boolKey(product.active),
  },
});

export const employeeSorter = createSorter<Employee, EmployeeSortBy>({
  keys: EMPLOYEE_SORT_KEYS,
  defaultSort: { sortBy: "name", sortDir: "asc" },
  tieBreak: (employee) => employee.id,
  accessors: {
    name: (employee) => textKey(employee.name),
    baseSalary: (employee) => numberKey(employee.baseSalary),
    status: (employee) => boolKey(employee.active),
  },
});

export const payrollPaymentSorter = createSorter<PayrollPaymentWithEmployee, PayrollPaymentSortBy>({
  keys: PAYROLL_PAYMENT_SORT_KEYS,
  defaultSort: { sortBy: "paymentDate", sortDir: "desc" },
  tieBreak: (payment) => payment.id,
  accessors: {
    // Derived in the repo's employee join — sorted after that map.
    employeeName: (payment) => textKey(payment.employee.name),
    periodStart: (payment) => rawKey(payment.periodStart),
    amount: (payment) => numberKey(payment.amount),
    paymentDate: (payment) => rawKey(payment.paymentDate),
  },
});
