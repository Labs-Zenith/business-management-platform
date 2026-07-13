import { describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/server/api-error";
import { lineTotal } from "@/lib/money";
import { invoiceRepo } from "@/lib/mock/invoice-repo";
import { resetStore, store } from "@/lib/mock/store";
import { customerFixtures } from "@/lib/mock/fixtures/data";
import type { InvoicePersist, Session } from "@/lib/services/ports";
import { computeStatus } from "@/lib/services/status";
import { createPayment, getPayment } from "./payment-service";

/**
 * SAFETY-CRITICAL: proves the payment service (the layer
 * `app/api/invoices/[id]/payments/route.ts` calls into) never partially
 * applies an overpay, never accepts a client-supplied `customerId`, and
 * always scopes to `session.businessId` — using the REAL mock store (not a
 * mocked repository), so "the store is left completely unchanged" is an
 * observable fact, not just an assertion about the thrown error. Matches the
 * real-concurrency-proof technique already established in
 * `lib/mock/payment-repo.test.ts` (PR1).
 */

const BUSINESS_ID = "10000000-0000-4000-8000-000000000001";
const OTHER_BUSINESS_ID = "10000000-0000-4000-8000-000000000099";
const CUSTOMER_ID = customerFixtures[0].id;

const SESSION: Session = {
  userId: "20000000-0000-4000-8000-000000000001",
  businessId: BUSINESS_ID,
  email: "demo@negociodemo.test",
  role: "admin",
};

function buildInvoicePersist(totalCents: number, dueDate: string | null = "2026-08-08"): InvoicePersist {
  const items = [{ description: "Servicio", quantity: 1, unitPrice: totalCents }];
  const withTotals = items.map((item) => ({ ...item, lineTotal: lineTotal(item.quantity, item.unitPrice) }));
  const subtotal = withTotals.reduce((sum, item) => sum + item.lineTotal, 0);
  const total = subtotal;
  return {
    customerId: CUSTOMER_ID,
    issueDate: "2026-07-08",
    dueDate,
    items: withTotals,
    subtotal,
    total,
    status: computeStatus(total, 0, dueDate, new Date("2026-07-08")),
    notes: null,
  };
}

/** Snapshot of everything an overpay attempt must leave untouched. */
function snapshotInvoiceState(invoiceId: string) {
  const invoice = store.invoices.get(invoiceId);
  const payments = [...store.payments.values()].filter((payment) => payment.invoiceId === invoiceId);
  return {
    invoice: invoice ? { ...invoice } : null,
    paymentCount: payments.length,
    paymentsTotal: payments.reduce((sum, payment) => sum + payment.amount, 0),
  };
}

describe("createPayment (payment-service)", () => {
  it("rejects an overpay attempt with a validation error and leaves the invoice/payments COMPLETELY unchanged", async () => {
    resetStore();
    const invoice = await invoiceRepo.create(BUSINESS_ID, buildInvoicePersist(200000));
    const before = snapshotInvoiceState(invoice.id);

    await expect(
      createPayment(SESSION, invoice.id, { paymentDate: "2026-07-08", amount: 250000 }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });

    const after = snapshotInvoiceState(invoice.id);
    // Not just "the response is an error" — the store state itself is
    // byte-for-byte identical before and after the rejected attempt.
    expect(after).toEqual(before);
    expect(after.invoice!.status).toBe("pending");
    expect(after.paymentCount).toBe(0);
  });

  it("rejects any payment on an invoice with balance == 0 (already fully paid)", async () => {
    resetStore();
    const invoice = await invoiceRepo.create(BUSINESS_ID, buildInvoicePersist(100000));
    await createPayment(SESSION, invoice.id, { paymentDate: "2026-07-08", amount: 100000 });
    const before = snapshotInvoiceState(invoice.id);
    expect(before.invoice!.status).toBe("paid");

    await expect(
      createPayment(SESSION, invoice.id, { paymentDate: "2026-07-09", amount: 1 }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });

    const after = snapshotInvoiceState(invoice.id);
    expect(after).toEqual(before);
  });

  it("ALWAYS derives customerId from the invoice's own customer, ignoring a forged customerId in the input", async () => {
    resetStore();
    const invoice = await invoiceRepo.create(BUSINESS_ID, buildInvoicePersist(100000));
    const forgedCustomerId = "40000000-0000-4000-8000-000000000999";

    const forgedInput = {
      paymentDate: "2026-07-08",
      amount: 50000,
      customerId: forgedCustomerId,
    } as unknown as Parameters<typeof createPayment>[2];

    const result = await createPayment(SESSION, invoice.id, forgedInput);

    const persisted = [...store.payments.values()].find((payment) => payment.invoiceId === invoice.id);
    expect(persisted).toBeDefined();
    expect(persisted!.customerId).toBe(invoice.customerId);
    expect(persisted!.customerId).not.toBe(forgedCustomerId);
    expect(result.payments[0]?.customerId).toBe(invoice.customerId);
  });

  it("recomputes and persists status/balance correctly after a valid partial payment (pending -> partially_paid)", async () => {
    resetStore();
    const invoice = await invoiceRepo.create(BUSINESS_ID, buildInvoicePersist(200000));

    const result = await createPayment(SESSION, invoice.id, { paymentDate: "2026-07-08", amount: 80000 });

    expect(result.status).toBe("partially_paid");
    expect(result.balance).toBe(120000);
    const persistedInvoice = store.invoices.get(invoice.id);
    expect(persistedInvoice!.status).toBe("partially_paid");
  });

  it("recomputes and persists status/balance correctly after a payment that exactly zeroes the balance (-> paid)", async () => {
    resetStore();
    const invoice = await invoiceRepo.create(BUSINESS_ID, buildInvoicePersist(150000));

    const result = await createPayment(SESSION, invoice.id, { paymentDate: "2026-07-08", amount: 150000 });

    expect(result.status).toBe("paid");
    expect(result.balance).toBe(0);
    const persistedInvoice = store.invoices.get(invoice.id);
    expect(persistedInvoice!.status).toBe("paid");
  });

  it("rejects a payment against an invoice belonging to a DIFFERENT business with NOT_FOUND, creating nothing", async () => {
    resetStore();
    const invoice = await invoiceRepo.create(BUSINESS_ID, buildInvoicePersist(100000));
    const paymentCountBefore = store.payments.size;

    const otherSession: Session = { ...SESSION, businessId: OTHER_BUSINESS_ID };

    await expect(
      createPayment(otherSession, invoice.id, { paymentDate: "2026-07-08", amount: 50000 }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    expect(store.payments.size).toBe(paymentCountBefore);
    const unchanged = store.invoices.get(invoice.id);
    expect(unchanged!.status).toBe("pending");
  });

  it("propagates ApiError instances (not generic Errors)", async () => {
    resetStore();
    const invoice = await invoiceRepo.create(BUSINESS_ID, buildInvoicePersist(100000));

    await expect(
      createPayment(SESSION, invoice.id, { paymentDate: "2026-07-08", amount: 999999 }),
    ).rejects.toBeInstanceOf(ApiError);
  });
});

/**
 * `createPayment`'s `payment_recorded` audit instrumentation, per
 * `openspec/changes/audit-log/specs/audit-logging/spec.md`'s "Instrumented
 * Events for This Phase" requirement. Unlike `invoice-service.test.ts` (which
 * mocks `repositories` entirely), this file already exercises the REAL mock
 * store/repos, so `recordAuditLog`'s call flows through the REAL
 * `lib/mock/audit-log-repo.ts` — asserting against `store.auditLogs`
 * directly proves the end-to-end wiring, not just a mocked call.
 */
describe("createPayment — payment_recorded audit instrumentation", () => {
  it("records a payment_recorded audit row (entityType='invoice', entityId=the invoice id) after a successful payment", async () => {
    resetStore();
    const invoice = await invoiceRepo.create(BUSINESS_ID, buildInvoicePersist(200000));

    await createPayment(SESSION, invoice.id, { paymentDate: "2026-07-08", amount: 80000 });

    const entries = [...store.auditLogs.values()].filter(
      (entry) => entry.entityType === "invoice" && entry.entityId === invoice.id,
    );
    expect(entries).toHaveLength(1);
    expect(entries[0]!.action).toBe("payment_recorded");
    expect(entries[0]!.businessId).toBe(BUSINESS_ID);
    expect(entries[0]!.actorUserId).toBe(SESSION.userId);
    expect(entries[0]!.detail).toBe("Amount: 80000");
  });

  it("does NOT record an audit row when the payment is rejected (overpay), no mutation at all", async () => {
    resetStore();
    const invoice = await invoiceRepo.create(BUSINESS_ID, buildInvoicePersist(200000));

    await expect(
      createPayment(SESSION, invoice.id, { paymentDate: "2026-07-08", amount: 250000 }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });

    const entries = [...store.auditLogs.values()].filter((entry) => entry.entityId === invoice.id);
    expect(entries).toHaveLength(0);
  });

  it("still returns the invoice detail successfully even if the audit-log repo's create rejects (best-effort, never affects the caller)", async () => {
    resetStore();
    const invoice = await invoiceRepo.create(BUSINESS_ID, buildInvoicePersist(200000));
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { auditLogRepo } = await import("@/lib/mock/audit-log-repo");
    const createSpy = vi.spyOn(auditLogRepo, "create").mockRejectedValueOnce(new Error("transient audit failure"));

    const result = await createPayment(SESSION, invoice.id, { paymentDate: "2026-07-08", amount: 80000 });

    expect(result.balance).toBe(120000);
    expect(consoleErrorSpy).toHaveBeenCalled();

    createSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });
});

/**
 * `getPayment` is the single-record lookup the print receipt page
 * (`app/(print)/payments/[id]/receipt/page.tsx`, PR8) relies on — it must
 * scope strictly to `session.businessId` so a cross-business payment id
 * surfaces as `NOT_FOUND`, never a leaked record (per
 * `openspec/changes/mocked-mvp-scaffold/specs/receipts/spec.md`'s
 * "business_id Scoping" requirement).
 */
describe("getPayment (payment-service)", () => {
  it("returns the payment with its customer/invoice refs when it belongs to the session's business", async () => {
    resetStore();
    const invoice = await invoiceRepo.create(BUSINESS_ID, buildInvoicePersist(100000));
    const detail = await createPayment(SESSION, invoice.id, {
      paymentDate: "2026-07-08",
      amount: 100000,
      method: "cash",
    });
    const paymentId = detail.payments[0]!.id;

    const payment = await getPayment(SESSION, paymentId);

    expect(payment.id).toBe(paymentId);
    expect(payment.amount).toBe(100000);
    expect(payment.customer.id).toBe(CUSTOMER_ID);
    expect(payment.invoice.id).toBe(invoice.id);
  });

  it("rejects a cross-business payment id with NOT_FOUND rather than returning another business's payment", async () => {
    resetStore();
    const invoice = await invoiceRepo.create(BUSINESS_ID, buildInvoicePersist(100000));
    const detail = await createPayment(SESSION, invoice.id, { paymentDate: "2026-07-08", amount: 100000 });
    const paymentId = detail.payments[0]!.id;

    const otherSession: Session = { ...SESSION, businessId: OTHER_BUSINESS_ID };

    await expect(getPayment(otherSession, paymentId)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("rejects a missing payment id with NOT_FOUND", async () => {
    resetStore();
    await expect(
      getPayment(SESSION, "00000000-0000-4000-8000-000000000000"),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
