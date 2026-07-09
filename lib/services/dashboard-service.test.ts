import { describe, expect, it } from "vitest";
import { lineTotal } from "@/lib/money";
import { repositories } from "@/lib/services/repositories";
import type { InvoicePersist, Session } from "@/lib/services/ports";
import {
  getDashboardCharts,
  getDashboardSummary,
  getOverdueInvoices,
  getPaidThisMonth,
  getPendingBalance,
  getRecentPayments,
  getTopDebtors,
} from "./dashboard-service";

/**
 * SAFETY-CRITICAL for the dashboard capability: every one of the 5 KPIs MUST
 * be scoped exclusively to `session.businessId`, per
 * `openspec/changes/mocked-mvp-scaffold/specs/dashboard/spec.md`'s
 * "Summary reflects only own business" scenario. This suite exercises the
 * REAL mock store (not mocked repositories, matching
 * `payment-service.test.ts`'s established technique).
 *
 * Each test generates ITS OWN fresh, random business ids (rather than
 * reusing shared constants across tests) so isolation assertions never
 * depend on inter-test cleanup — this is a stronger guarantee than
 * `resetStore()` alone: any leftover data from fixtures or earlier tests in
 * this file simply cannot match a freshly generated id, so a genuine
 * business_id leak (not test pollution) is the only way these assertions
 * could ever pass incorrectly.
 */

// Fixed reference "now" so "current calendar month" assertions never flake
// depending on when the suite actually runs.
const NOW = new Date();
const THIS_MONTH_DATE = NOW.toISOString().slice(0, 10);
const THIS_MONTH_KEY = THIS_MONTH_DATE.slice(0, 7);
// Two months back (not one) so the boundary is never ambiguous even if NOW
// is near a month edge.
const PREVIOUS_MONTH_DATE = new Date(NOW.getFullYear(), NOW.getMonth() - 2, 15).toISOString().slice(0, 10);
const PREVIOUS_MONTH_KEY = PREVIOUS_MONTH_DATE.slice(0, 7);

const PAST_DUE_DATE = "2020-01-01"; // always in the past, regardless of when the suite runs
const FUTURE_DUE_DATE = "2099-01-01"; // always in the future

function invoicePersist(
  customerId: string,
  totalCents: number,
  dueDate: string | null,
  issueDate: string,
  status: InvoicePersist["status"] = "pending",
): InvoicePersist {
  const item = { description: "Servicio", quantity: 1, unitPrice: totalCents };
  const itemLineTotal = lineTotal(item.quantity, item.unitPrice);
  return {
    customerId,
    issueDate,
    dueDate,
    items: [{ ...item, lineTotal: itemLineTotal }],
    subtotal: itemLineTotal,
    total: itemLineTotal,
    status,
    notes: null,
  };
}

async function createCustomer(businessId: string, name: string) {
  return repositories.customers.create(businessId, { name });
}

function newBusinessId(): string {
  return crypto.randomUUID();
}

function sessionFor(businessId: string): Session {
  return { userId: crypto.randomUUID(), businessId, email: "owner@negocio.test" };
}

describe("dashboard-service", () => {
  it("computes all 5 KPIs scoped strictly to session.businessId, with zero cross-business leakage", async () => {
    const businessA = newBusinessId();
    const businessB = newBusinessId();
    const sessionA = sessionFor(businessA);
    const sessionB = sessionFor(businessB);

    // -- Business A: a rich scenario covering pending, overdue, paid, partially_paid --
    const customerA1 = await createCustomer(businessA, "Cliente A1");
    const customerA2 = await createCustomer(businessA, "Cliente A2");

    // Pending: no payments, due date in the future.
    await repositories.invoices.create(
      businessA,
      invoicePersist(customerA1.id, 100_000, FUTURE_DUE_DATE, THIS_MONTH_DATE),
    );

    // Overdue: no payments, due date in the past.
    const invoiceA2 = await repositories.invoices.create(
      businessA,
      invoicePersist(customerA1.id, 50_000, PAST_DUE_DATE, THIS_MONTH_DATE),
    );

    // Paid: single payment this month exactly zeroing the balance.
    const invoiceA3 = await repositories.invoices.create(
      businessA,
      invoicePersist(customerA2.id, 80_000, FUTURE_DUE_DATE, THIS_MONTH_DATE),
    );
    await repositories.payments.createForInvoice(businessA, invoiceA3.id, {
      paymentDate: THIS_MONTH_DATE,
      amount: 80_000,
      method: "cash",
    });

    // Partially paid: a payment made in a PREVIOUS month (must not count
    // toward "paidThisMonth"), balance remains > 0.
    const invoiceA4 = await repositories.invoices.create(
      businessA,
      invoicePersist(customerA2.id, 60_000, FUTURE_DUE_DATE, THIS_MONTH_DATE),
    );
    await repositories.payments.createForInvoice(businessA, invoiceA4.id, {
      paymentDate: PREVIOUS_MONTH_DATE,
      amount: 20_000,
      method: "transfer",
    });

    // -- Business B: deliberately larger numbers, to prove they never bleed into A's summary --
    const customerB1 = await createCustomer(businessB, "Cliente B1 (mucho mas grande)");
    // Overdue, no payment at all — must never appear in A's overdue list
    // despite being a far larger amount.
    const invoiceB1 = await repositories.invoices.create(
      businessB,
      invoicePersist(customerB1.id, 50_000_000, PAST_DUE_DATE, THIS_MONTH_DATE),
    );

    const summaryA = await getDashboardSummary(sessionA, NOW);
    const summaryB = await getDashboardSummary(sessionB, NOW);

    // (1) Total pendiente por cobrar: sum of balance across non-paid invoices only.
    // invoiceA1 balance=100000, invoiceA2 balance=50000, invoiceA4 balance=40000.
    // invoiceA3 is fully paid -> excluded (balance 0).
    expect(summaryA.pendingBalance).toBe(190_000);
    expect(summaryA.pendingBalance).not.toBe(summaryB.pendingBalance);

    // (2) Total pagado del mes: only invoiceA3's this-month payment counts;
    // invoiceA4's payment was made in a previous month and must be excluded.
    expect(summaryA.paidThisMonth).toBe(80_000);

    // (3) Facturas vencidas: only invoiceA2 is overdue for business A.
    expect(summaryA.overdueInvoices).toBe(1);
    expect(summaryA.overdueInvoiceList.map((invoice) => invoice.id)).toEqual([invoiceA2.id]);
    expect(summaryA.overdueInvoiceList.some((invoice) => invoice.id === invoiceB1.id)).toBe(false);

    // (4) Pagos recientes: business A's own 2 payments only, newest first.
    expect(summaryA.recentPayments).toHaveLength(2);
    expect(summaryA.recentPayments[0]!.paymentDate >= summaryA.recentPayments[1]!.paymentDate).toBe(true);
    expect(summaryA.recentPayments.every((payment) => payment.customer.id !== customerB1.id)).toBe(true);

    // (5) Clientes con mayor saldo: ranked within business A only.
    // customerA1 balance = 100000 + 50000 = 150000; customerA2 balance = 40000 (A3 fully paid).
    expect(summaryA.topDebtors).toEqual([
      { id: customerA1.id, name: "Cliente A1", balance: 150_000 },
      { id: customerA2.id, name: "Cliente A2", balance: 40_000 },
    ]);
    // Business B's customer has a far bigger balance, but must never outrank
    // (or even appear among) business A's top debtors.
    expect(summaryA.topDebtors.some((debtor) => debtor.id === customerB1.id)).toBe(false);

    // -- Symmetric check: business B's summary never contains business A's data --
    expect(summaryB.pendingBalance).toBe(50_000_000);
    expect(summaryB.overdueInvoices).toBe(1);
    expect(summaryB.overdueInvoiceList.map((invoice) => invoice.id)).toEqual([invoiceB1.id]);
    expect(summaryB.recentPayments.every((payment) => payment.customer.id !== customerA1.id)).toBe(true);
    expect(summaryB.topDebtors.some((debtor) => debtor.id === customerA1.id || debtor.id === customerA2.id)).toBe(
      false,
    );
  });

  it("computes dashboard chart series scoped strictly to session.businessId", async () => {
    const businessA = newBusinessId();
    const businessB = newBusinessId();
    const sessionA = sessionFor(businessA);

    const customerA1 = await createCustomer(businessA, "Cliente Grafica A1");
    const customerA2 = await createCustomer(businessA, "Cliente Grafica A2");
    const customerB1 = await createCustomer(businessB, "Cliente Grafica B1");

    await repositories.invoices.create(
      businessA,
      invoicePersist(customerA1.id, 100_000, FUTURE_DUE_DATE, THIS_MONTH_DATE),
    );
    await repositories.invoices.create(
      businessA,
      invoicePersist(customerA1.id, 50_000, PAST_DUE_DATE, THIS_MONTH_DATE),
    );
    const paidInvoice = await repositories.invoices.create(
      businessA,
      invoicePersist(customerA2.id, 80_000, FUTURE_DUE_DATE, THIS_MONTH_DATE),
    );
    await repositories.payments.createForInvoice(businessA, paidInvoice.id, {
      paymentDate: THIS_MONTH_DATE,
      amount: 80_000,
      method: "cash",
    });
    const partiallyPaidInvoice = await repositories.invoices.create(
      businessA,
      invoicePersist(customerA2.id, 60_000, FUTURE_DUE_DATE, THIS_MONTH_DATE),
    );
    await repositories.payments.createForInvoice(businessA, partiallyPaidInvoice.id, {
      paymentDate: PREVIOUS_MONTH_DATE,
      amount: 20_000,
      method: "transfer",
    });

    const foreignInvoice = await repositories.invoices.create(
      businessB,
      invoicePersist(customerB1.id, 50_000_000, PAST_DUE_DATE, THIS_MONTH_DATE),
    );
    await repositories.payments.createForInvoice(businessB, foreignInvoice.id, {
      paymentDate: THIS_MONTH_DATE,
      amount: 5_000_000,
      method: "cash",
    });

    const charts = await getDashboardCharts(sessionA, NOW);

    expect(charts.receivablesByStatus).toEqual([
      { status: "pending", label: "Pendiente", count: 1, balance: 100_000, total: 100_000 },
      { status: "partially_paid", label: "Parcial", count: 1, balance: 40_000, total: 60_000 },
      { status: "paid", label: "Pagada", count: 1, balance: 0, total: 80_000 },
      { status: "overdue", label: "Vencida", count: 1, balance: 50_000, total: 50_000 },
    ]);
    expect(charts.topDebtorBalances).toEqual([
      { id: customerA1.id, name: "Cliente Grafica A1", balance: 150_000 },
      { id: customerA2.id, name: "Cliente Grafica A2", balance: 40_000 },
    ]);
    expect(charts.topDebtorBalances.some((debtor) => debtor.id === customerB1.id)).toBe(false);

    expect(charts.monthlyPayments).toHaveLength(6);
    expect(charts.monthlyPayments.find((month) => month.month === THIS_MONTH_KEY)).toMatchObject({
      month: THIS_MONTH_KEY,
      amount: 80_000,
    });
    expect(charts.monthlyPayments.find((month) => month.month === PREVIOUS_MONTH_KEY)).toMatchObject({
      month: PREVIOUS_MONTH_KEY,
      amount: 20_000,
    });
    expect(charts.monthlyPayments.every((month) => month.amount < 5_000_000)).toBe(true);
  });

  it("uses the repository-recomputed status, never a stale/forged persisted status field, to decide overdue/pending", async () => {
    const businessId = newBusinessId();
    const session = sessionFor(businessId);
    const customer = await createCustomer(businessId, "Cliente Vencido Disfrazado");

    // Persisted with a LYING status of "paid" even though it has a past due
    // date and zero payments — a real computation must classify it as
    // "overdue" regardless of this forged initial value.
    const disguisedOverdue = await repositories.invoices.create(
      businessId,
      invoicePersist(customer.id, 30_000, PAST_DUE_DATE, THIS_MONTH_DATE, "paid"),
    );

    const overdue = await getOverdueInvoices(session);
    const pendingBalance = await getPendingBalance(session);

    expect(overdue.map((invoice) => invoice.id)).toContain(disguisedOverdue.id);
    expect(overdue.find((invoice) => invoice.id === disguisedOverdue.id)!.status).toBe("overdue");
    expect(pendingBalance).toBe(30_000);
  });

  it("individual granular KPI functions are ALSO scoped to session.businessId (used independently by dashboard sections)", async () => {
    const businessA = newBusinessId();
    const businessB = newBusinessId();
    const sessionA = sessionFor(businessA);

    const customerA = await createCustomer(businessA, "Cliente Solo A");
    const customerB = await createCustomer(businessB, "Cliente Solo B");

    await repositories.invoices.create(businessA, invoicePersist(customerA.id, 10_000, PAST_DUE_DATE, THIS_MONTH_DATE));
    const invoiceB = await repositories.invoices.create(
      businessB,
      invoicePersist(customerB.id, 10_000_000, PAST_DUE_DATE, THIS_MONTH_DATE),
    );
    await repositories.payments.createForInvoice(businessB, invoiceB.id, {
      paymentDate: THIS_MONTH_DATE,
      amount: 1_000_000,
      method: "cash",
    });

    expect(await getPendingBalance(sessionA)).toBe(10_000);
    expect(await getPaidThisMonth(sessionA, NOW)).toBe(0);
    expect((await getRecentPayments(sessionA)).length).toBe(0);
    expect((await getTopDebtors(sessionA)).some((debtor) => debtor.id === customerB.id)).toBe(false);
  });
});
