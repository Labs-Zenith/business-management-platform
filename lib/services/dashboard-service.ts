/**
 * Dashboard aggregation service, per
 * `openspec/changes/mocked-mvp-scaffold/specs/dashboard/spec.md` and
 * `docs/mvp-scope.md`/`docs/ui-ux-flow.md`'s "Dashboard" sections.
 *
 * Every function below resolves `businessId` ONLY from `session.businessId`
 * and reads exclusively through `repositories.{invoices,payments,customers}`
 * (never `lib/mock/store.ts` directly). `lib/mock/invoice-repo.ts`'s
 * `list()` already recomputes `status`/`balance` at read time via
 * `lib/services/status.ts`'s `computeStatus` (`withFinance`), never trusting
 * a persisted status field — this service inherits that guarantee rather
 * than re-deriving status itself, matching `invoice-service.ts`'s layering.
 *
 * Deliberately split into small, individually-callable functions instead of
 * one monolithic aggregate: `app/(dashboard)/dashboard/page.tsx` renders one
 * independent `<Suspense>` boundary per section, each calling only the
 * function(s) it needs, so a slow section never blocks the others from
 * streaming in. `getDashboardSummary` composes all of them via
 * `Promise.all` for `app/api/dashboard/summary/route.ts`, which returns
 * everything in a single payload.
 *
 * Functions come in two flavors, and the distinction is load-bearing:
 *
 * - **Range-scoped** (`getPaidInPeriod`, `getInvoicedInPeriod`,
 *   `getRecentPayments`, the monthly series of `getDashboardCharts`) take a
 *   resolved `DashboardPeriod` (`lib/services/dashboard-period.ts`) and push
 *   its `from`/`to` down into the repository `list()` filters.
 * - **Point-in-time** (`getPendingBalance`, `getOverdueInvoices`,
 *   `getOverdueCount`, `getTopDebtors`, `receivablesByStatus`) take NO period
 *   and never will: `status`/`balance` are recomputed against *today* by the
 *   repository, so these describe the portfolio as it stands now, not as it
 *   stood at the end of some past month. Accepting a period they silently
 *   ignored would be a trap. The dashboard labels them "a hoy" instead.
 */

import { repositories } from "@/lib/services/repositories";
import type { InvoiceWithFinance, PaymentWithRefs, Session } from "@/lib/services/ports";
import type { InvoiceStatus } from "@/lib/services/status";
import { monthEnd, monthShortLabel, monthStart, type DashboardPeriod } from "@/lib/services/dashboard-period";

/**
 * Large enough to fetch the whole business-scoped list in one call. The
 * mock repositories don't enforce a page-size ceiling internally — only
 * `lib/server/http.ts`'s `parsePagination` caps requests coming from the
 * HTTP layer at 50. A real swap-in would replace these calls with dedicated
 * SQL aggregate queries instead of an unbounded `list`.
 */
const ALL_ROWS = Number.MAX_SAFE_INTEGER;

const DEFAULT_RECENT_PAYMENTS_LIMIT = 5;
const DEFAULT_TOP_DEBTORS_LIMIT = 5;

const INVOICE_STATUS_CHART_META: Record<InvoiceStatus, { label: string }> = {
  pending: { label: "Pendiente" },
  partially_paid: { label: "Parcial" },
  paid: { label: "Pagada" },
  overdue: { label: "Vencida" },
};

const INVOICE_STATUS_CHART_ORDER: InvoiceStatus[] = ["pending", "partially_paid", "paid", "overdue"];

export type TopDebtor = {
  id: string;
  name: string;
  balance: number;
};

export type DashboardSummary = {
  pendingBalance: number;
  /**
   * Total collected within the requested period. The field keeps its
   * `paidThisMonth` name because `docs/api-spec.md` documents it and
   * `/api/dashboard/summary` consumers read it; with no `?period=` the
   * default period IS the current month, so the name stays accurate there.
   */
  paidThisMonth: number;
  /** Count only, matching `docs/api-spec.md`'s documented response shape. */
  overdueInvoices: number;
  /** Additive to the documented shape: powers the dashboard's overdue-list UI section. */
  overdueInvoiceList: InvoiceWithFinance[];
  recentPayments: PaymentWithRefs[];
  topDebtors: TopDebtor[];
};

export type ReceivablesByStatusDatum = {
  status: InvoiceStatus;
  label: string;
  count: number;
  balance: number;
  total: number;
};

export type MonthlyPaymentDatum = {
  month: string;
  label: string;
  amount: number;
};

/** The point-in-time half of the charts: today's portfolio, unaffected by the selected period. */
export type PortfolioCharts = {
  receivablesByStatus: ReceivablesByStatusDatum[];
  topDebtorBalances: TopDebtor[];
};

/** The range-scoped half: monthly series over `period.chartMonths`. */
export type PeriodCharts = {
  monthlyPayments: MonthlyPaymentDatum[];
  /** "Facturado" series, parallel to `monthlyPayments` ("cobrado") — same `period.chartMonths` bucketing, aligned by index. */
  monthlyInvoiced: MonthlyPaymentDatum[];
};

/**
 * Both halves in one payload, for the export/summary routes that render
 * everything at once. The dashboard screen calls the two halves separately —
 * they live in different sections now ("Cartera (a hoy)" vs. the Ingresos
 * tab), and each must fetch only what it renders.
 */
export type DashboardCharts = PortfolioCharts & PeriodCharts;

/**
 * Inclusive `YYYY-MM-DD` bounds, either of which may be absent. Both the
 * resolved `DashboardPeriod` and a chart's bucket span are assignable to this,
 * and it maps 1:1 onto the `from`/`to` filters every repository's `list()`
 * already supports — so date filtering happens at the repository, not by
 * pulling the whole table and filtering in JS.
 */
type DateRange = { from?: string; to?: string };

/**
 * `range` is optional on purpose: the point-in-time functions
 * (`getPendingBalance`, `getOverdueInvoices`, `getTopDebtors`, and the
 * `receivablesByStatus` slice of the charts) are "as of now" by construction —
 * the repository recomputes `status`/`balance` against today — so they read
 * the whole ledger regardless of which period the screen is showing.
 */
async function listInvoices(session: Session, range?: DateRange): Promise<InvoiceWithFinance[]> {
  const paged = await repositories.invoices.list(session.businessId, {
    from: range?.from,
    to: range?.to,
    page: 1,
    pageSize: ALL_ROWS,
  });
  return paged.data;
}

async function listPayments(session: Session, range?: DateRange): Promise<PaymentWithRefs[]> {
  const paged = await repositories.payments.list(session.businessId, {
    from: range?.from,
    to: range?.to,
    page: 1,
    pageSize: ALL_ROWS,
  });
  return paged.data;
}

/** The span the trend charts cover, which is wider than `period` for a single month (6 trailing buckets). */
function chartRange(period: DashboardPeriod): DateRange {
  return {
    from: monthStart(period.chartMonths[0]),
    to: monthEnd(period.chartMonths[period.chartMonths.length - 1]),
  };
}

async function listAllCustomers(session: Session) {
  const paged = await repositories.customers.list(session.businessId, { page: 1, pageSize: ALL_ROWS });
  return paged.data;
}

/**
 * "Total pendiente por cobrar": sum of `balance` across every non-paid
 * invoice, scoped to `session.businessId`. Point-in-time — deliberately takes
 * NO period: it is the portfolio as it stands today, and the dashboard labels
 * it "a hoy" so a past-month view can't be misread as a historical snapshot.
 */
export async function getPendingBalance(session: Session): Promise<number> {
  const invoices = await listInvoices(session);
  return invoices.filter((invoice) => invoice.status !== "paid").reduce((sum, invoice) => sum + invoice.balance, 0);
}

/** "Total pagado": sum of payment amounts whose `paymentDate` falls inside `period`. */
export async function getPaidInPeriod(session: Session, period: DashboardPeriod): Promise<number> {
  const payments = await listPayments(session, period);
  return payments.reduce((sum, payment) => sum + payment.amount, 0);
}

/** "Total facturado": sum of invoice `total` whose `issueDate` falls inside `period`. */
export async function getInvoicedInPeriod(session: Session, period: DashboardPeriod): Promise<number> {
  const invoices = await listInvoices(session, period);
  return invoices.reduce((sum, invoice) => sum + invoice.total, 0);
}

/**
 * "Facturas vencidas": every invoice whose repository-recomputed `status` is
 * `"overdue"` — never a persisted/stale status field.
 */
export async function getOverdueInvoices(session: Session): Promise<InvoiceWithFinance[]> {
  const invoices = await listInvoices(session);
  return invoices.filter((invoice) => invoice.status === "overdue");
}

/** Lightweight count variant of `getOverdueInvoices`, for KPI-card-only sections. */
export async function getOverdueCount(session: Session): Promise<number> {
  const overdue = await getOverdueInvoices(session);
  return overdue.length;
}

/**
 * "Pagos recientes": the `limit` most recent payments inside `period`, newest
 * first. Scoped to the period rather than all-time so that viewing July never
 * lists August payments under a "Julio 2026" heading.
 */
export async function getRecentPayments(
  session: Session,
  period: DashboardPeriod,
  limit: number = DEFAULT_RECENT_PAYMENTS_LIMIT,
): Promise<PaymentWithRefs[]> {
  const payments = await listPayments(session, period);
  return [...payments]
    .sort((a, b) => {
      if (a.paymentDate !== b.paymentDate) {
        return a.paymentDate < b.paymentDate ? 1 : -1;
      }
      return a.createdAt < b.createdAt ? 1 : -1;
    })
    .slice(0, limit);
}

/** "Clientes con mayor saldo": the `limit` customers with the highest outstanding balance across their invoices. */
export async function getTopDebtors(
  session: Session,
  limit: number = DEFAULT_TOP_DEBTORS_LIMIT,
): Promise<TopDebtor[]> {
  const customers = await listAllCustomers(session);
  return customers
    .filter((customer) => customer.balance > 0)
    .sort((a, b) => b.balance - a.balance)
    .slice(0, limit)
    .map((customer) => ({ id: customer.id, name: customer.name, balance: customer.balance }));
}

/**
 * Point-in-time charts: how the portfolio stands TODAY, by invoice status and
 * by debtor. Takes no period — these belong to the dashboard's "Cartera (a
 * hoy)" section, which sits outside the period-scoped tabs.
 */
export async function getPortfolioCharts(session: Session): Promise<PortfolioCharts> {
  const [invoices, topDebtorBalances] = await Promise.all([listInvoices(session), getTopDebtors(session)]);

  const receivablesByStatus = INVOICE_STATUS_CHART_ORDER.map((status) => {
    const matchingInvoices = invoices.filter((invoice) => invoice.status === status);
    return {
      status,
      label: INVOICE_STATUS_CHART_META[status].label,
      count: matchingInvoices.length,
      balance: matchingInvoices.reduce((sum, invoice) => sum + invoice.balance, 0),
      total: matchingInvoices.reduce((sum, invoice) => sum + invoice.total, 0),
    };
  });

  return { receivablesByStatus, topDebtorBalances };
}

/**
 * Range-scoped charts: "facturado" and "cobrado" bucketed over
 * `period.chartMonths` — which, for a single selected month, is the 6 months
 * ENDING at it, so the trend context survives rather than collapsing to one bar.
 */
export async function getPeriodCharts(session: Session, period: DashboardPeriod): Promise<PeriodCharts> {
  const range = chartRange(period);
  const [chartInvoices, chartPayments] = await Promise.all([
    listInvoices(session, range),
    listPayments(session, range),
  ]);

  const months = period.chartMonths;

  const amountsByMonth = new Map(months.map((month) => [month, 0]));
  for (const payment of chartPayments) {
    const paymentMonth = payment.paymentDate.slice(0, 7);
    if (amountsByMonth.has(paymentMonth)) {
      amountsByMonth.set(paymentMonth, amountsByMonth.get(paymentMonth)! + payment.amount);
    }
  }

  const invoicedAmountsByMonth = new Map(months.map((month) => [month, 0]));
  for (const invoice of chartInvoices) {
    const invoiceMonth = invoice.issueDate.slice(0, 7);
    if (invoicedAmountsByMonth.has(invoiceMonth)) {
      invoicedAmountsByMonth.set(invoiceMonth, invoicedAmountsByMonth.get(invoiceMonth)! + invoice.total);
    }
  }

  return {
    monthlyPayments: months.map((month) => ({
      month,
      label: monthShortLabel(month),
      amount: amountsByMonth.get(month) ?? 0,
    })),
    monthlyInvoiced: months.map((month) => ({
      month,
      label: monthShortLabel(month),
      amount: invoicedAmountsByMonth.get(month) ?? 0,
    })),
  };
}

/**
 * Both halves at once, for `/api/dashboard/export` and `/summary`, which
 * render the whole dashboard in one payload. Kept as a composer so the export
 * pipeline (`lib/export/excel.ts`, `lib/export/chart-image.ts`) and the
 * `DashboardCharts` shape are untouched by the screen's section split.
 */
export async function getDashboardCharts(session: Session, period: DashboardPeriod): Promise<DashboardCharts> {
  const [portfolio, periodCharts] = await Promise.all([
    getPortfolioCharts(session),
    getPeriodCharts(session, period),
  ]);
  return { ...portfolio, ...periodCharts };
}

/** Combines all 5 KPIs in one payload, for `app/api/dashboard/summary/route.ts`. */
export async function getDashboardSummary(session: Session, period: DashboardPeriod): Promise<DashboardSummary> {
  const [pendingBalance, paidThisMonth, overdueInvoiceList, recentPayments, topDebtors] = await Promise.all([
    getPendingBalance(session),
    getPaidInPeriod(session, period),
    getOverdueInvoices(session),
    getRecentPayments(session, period),
    getTopDebtors(session),
  ]);

  return {
    pendingBalance,
    paidThisMonth,
    overdueInvoices: overdueInvoiceList.length,
    overdueInvoiceList,
    recentPayments,
    topDebtors,
  };
}
