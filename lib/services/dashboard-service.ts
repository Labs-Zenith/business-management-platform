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
 */

import { repositories } from "@/lib/services/repositories";
import type { InvoiceWithFinance, PaymentWithRefs, Session } from "@/lib/services/ports";
import type { InvoiceStatus } from "@/lib/services/status";

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
const DEFAULT_MONTHLY_PAYMENT_BUCKETS = 6;

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

export type DashboardCharts = {
  receivablesByStatus: ReceivablesByStatusDatum[];
  topDebtorBalances: TopDebtor[];
  monthlyPayments: MonthlyPaymentDatum[];
};

async function listAllInvoices(session: Session): Promise<InvoiceWithFinance[]> {
  const paged = await repositories.invoices.list(session.businessId, { page: 1, pageSize: ALL_ROWS });
  return paged.data;
}

async function listAllPayments(session: Session): Promise<PaymentWithRefs[]> {
  const paged = await repositories.payments.list(session.businessId, { page: 1, pageSize: ALL_ROWS });
  return paged.data;
}

async function listAllCustomers(session: Session) {
  const paged = await repositories.customers.list(session.businessId, { page: 1, pageSize: ALL_ROWS });
  return paged.data;
}

function currentMonthPrefix(now: Date): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function monthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(key: string): string {
  const [year, month] = key.split("-").map(Number);
  return new Intl.DateTimeFormat("es-CO", { month: "short" }).format(new Date(year, month - 1, 1));
}

function recentMonthKeys(now: Date, count: number): string[] {
  return Array.from({ length: count }, (_, index) => {
    const offset = count - index - 1;
    return monthKey(new Date(now.getFullYear(), now.getMonth() - offset, 1));
  });
}

/** "Total pendiente por cobrar": sum of `balance` across every non-paid invoice, scoped to `session.businessId`. */
export async function getPendingBalance(session: Session): Promise<number> {
  const invoices = await listAllInvoices(session);
  return invoices.filter((invoice) => invoice.status !== "paid").reduce((sum, invoice) => sum + invoice.balance, 0);
}

/** "Total pagado del mes": sum of payment amounts whose `paymentDate` falls in the current calendar month. */
export async function getPaidThisMonth(session: Session, now: Date = new Date()): Promise<number> {
  const payments = await listAllPayments(session);
  const monthPrefix = currentMonthPrefix(now);
  return payments
    .filter((payment) => payment.paymentDate.startsWith(monthPrefix))
    .reduce((sum, payment) => sum + payment.amount, 0);
}

/**
 * "Facturas vencidas": every invoice whose repository-recomputed `status` is
 * `"overdue"` — never a persisted/stale status field.
 */
export async function getOverdueInvoices(session: Session): Promise<InvoiceWithFinance[]> {
  const invoices = await listAllInvoices(session);
  return invoices.filter((invoice) => invoice.status === "overdue");
}

/** Lightweight count variant of `getOverdueInvoices`, for KPI-card-only sections. */
export async function getOverdueCount(session: Session): Promise<number> {
  const overdue = await getOverdueInvoices(session);
  return overdue.length;
}

/** "Pagos recientes": the `limit` most recent payments, newest first. */
export async function getRecentPayments(
  session: Session,
  limit: number = DEFAULT_RECENT_PAYMENTS_LIMIT,
): Promise<PaymentWithRefs[]> {
  const payments = await listAllPayments(session);
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

export async function getDashboardCharts(
  session: Session,
  now: Date = new Date(),
  monthBuckets: number = DEFAULT_MONTHLY_PAYMENT_BUCKETS,
): Promise<DashboardCharts> {
  const [invoices, payments, topDebtorBalances] = await Promise.all([
    listAllInvoices(session),
    listAllPayments(session),
    getTopDebtors(session),
  ]);

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

  const months = recentMonthKeys(now, monthBuckets);
  const amountsByMonth = new Map(months.map((month) => [month, 0]));
  for (const payment of payments) {
    const paymentMonth = payment.paymentDate.slice(0, 7);
    if (amountsByMonth.has(paymentMonth)) {
      amountsByMonth.set(paymentMonth, amountsByMonth.get(paymentMonth)! + payment.amount);
    }
  }

  return {
    receivablesByStatus,
    topDebtorBalances,
    monthlyPayments: months.map((month) => ({
      month,
      label: monthLabel(month),
      amount: amountsByMonth.get(month) ?? 0,
    })),
  };
}

/** Combines all 5 KPIs in one payload, for `app/api/dashboard/summary/route.ts`. */
export async function getDashboardSummary(session: Session, now: Date = new Date()): Promise<DashboardSummary> {
  const [pendingBalance, paidThisMonth, overdueInvoiceList, recentPayments, topDebtors] = await Promise.all([
    getPendingBalance(session),
    getPaidThisMonth(session, now),
    getOverdueInvoices(session),
    getRecentPayments(session),
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
