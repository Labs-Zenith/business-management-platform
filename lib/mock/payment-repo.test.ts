import { describe, expect, it } from "vitest";
import { lineTotal } from "@/lib/money";
import type { InvoicePersist } from "@/lib/services/ports";
import { computeStatus } from "@/lib/services/status";
import { ApiError } from "@/lib/server/api-error";
import { invoiceRepo } from "./invoice-repo";
import { paymentRepo } from "./payment-repo";
import { customerFixtures } from "./fixtures/data";
import { resetStore } from "./store";

const BUSINESS_ID = "10000000-0000-4000-8000-000000000001";
const CUSTOMER_ID = customerFixtures[0].id;

function buildInvoicePersist(totalCents: number): InvoicePersist {
  const items = [{ description: "Servicio", quantity: 1, unitPrice: totalCents }];
  const withTotals = items.map((item) => ({ ...item, lineTotal: lineTotal(item.quantity, item.unitPrice) }));
  const subtotal = withTotals.reduce((sum, item) => sum + item.lineTotal, 0);
  const total = subtotal;
  return {
    customerId: CUSTOMER_ID,
    issueDate: "2026-07-08",
    dueDate: "2026-08-08",
    items: withTotals,
    subtotal,
    total,
    status: computeStatus(total, 0, "2026-08-08", new Date("2026-07-08")),
    notes: null,
  };
}

describe("paymentRepo.getById — business_id scoping", () => {
  it("returns the payment when it belongs to the requesting business", async () => {
    resetStore();
    const invoice = await invoiceRepo.create(BUSINESS_ID, buildInvoicePersist(100000));
    const detail = await paymentRepo.createForInvoice(BUSINESS_ID, invoice.id, {
      paymentDate: "2026-07-08",
      amount: 100000,
      method: "cash",
      notes: null,
    });
    const paymentId = detail.payments[0]!.id;

    const found = await paymentRepo.getById(BUSINESS_ID, paymentId);
    expect(found).not.toBeNull();
    expect(found!.id).toBe(paymentId);
    expect(found!.customer.id).toBe(CUSTOMER_ID);
    expect(found!.invoice.id).toBe(invoice.id);
  });

  it("returns null (not a leaked record) for a payment belonging to another business", async () => {
    resetStore();
    const invoice = await invoiceRepo.create(BUSINESS_ID, buildInvoicePersist(100000));
    const detail = await paymentRepo.createForInvoice(BUSINESS_ID, invoice.id, {
      paymentDate: "2026-07-08",
      amount: 100000,
      method: "cash",
      notes: null,
    });
    const paymentId = detail.payments[0]!.id;

    const found = await paymentRepo.getById("10000000-0000-4000-8000-000000000099", paymentId);
    expect(found).toBeNull();
  });

  it("returns null for a missing payment id", async () => {
    resetStore();
    const found = await paymentRepo.getById(BUSINESS_ID, "00000000-0000-4000-8000-000000000000");
    expect(found).toBeNull();
  });
});

describe("paymentRepo.createForInvoice — overpay race (safety-critical)", () => {
  it("accepts exactly one of two concurrent payments that individually fit but combined exceed the balance, and the balance never goes negative", async () => {
    resetStore();
    const invoice = await invoiceRepo.create(BUSINESS_ID, buildInvoicePersist(200000));

    // Fire genuinely concurrent payment registrations via Promise.allSettled
    // — NOT sequential awaits, which would trivially avoid any race.
    const [first, second] = await Promise.allSettled([
      paymentRepo.createForInvoice(BUSINESS_ID, invoice.id, {
        paymentDate: "2026-07-08",
        amount: 150000,
        method: "cash",
        notes: null,
      }),
      paymentRepo.createForInvoice(BUSINESS_ID, invoice.id, {
        paymentDate: "2026-07-08",
        amount: 150000,
        method: "transfer",
        notes: null,
      }),
    ]);

    const settled = [first, second];
    const fulfilled = settled.filter((r) => r.status === "fulfilled");
    const rejected = settled.filter((r): r is PromiseRejectedResult => r.status === "rejected");

    // Exactly one succeeds, the other is rejected.
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0]?.reason).toBeInstanceOf(ApiError);
    expect((rejected[0]?.reason as ApiError).code).toBe("VALIDATION_ERROR");

    const finalInvoice = await invoiceRepo.getById(BUSINESS_ID, invoice.id);
    expect(finalInvoice).not.toBeNull();
    // Only the winning 150000 payment was ever recorded — balance never negative,
    // and the two payments were never allowed to combine past the total.
    expect(finalInvoice!.balance).toBe(50000);
    expect(finalInvoice!.balance).toBeGreaterThanOrEqual(0);
    expect(finalInvoice!.payments).toHaveLength(1);
    expect(finalInvoice!.status).toBe("partially_paid");
  });

  it("rejects a payment exceeding the balance without mutating the invoice at all", async () => {
    resetStore();
    const invoice = await invoiceRepo.create(BUSINESS_ID, buildInvoicePersist(200000));

    await expect(
      paymentRepo.createForInvoice(BUSINESS_ID, invoice.id, {
        paymentDate: "2026-07-08",
        amount: 250000,
        method: "cash",
        notes: null,
      }),
    ).rejects.toThrow();

    const unchanged = await invoiceRepo.getById(BUSINESS_ID, invoice.id);
    expect(unchanged!.paidAmount).toBe(0);
    expect(unchanged!.balance).toBe(200000);
    expect(unchanged!.payments).toHaveLength(0);
  });

  it("derives customer_id from the invoice, ignoring any client-supplied customer id", async () => {
    resetStore();
    const invoice = await invoiceRepo.create(BUSINESS_ID, buildInvoicePersist(100000));

    const updated = await paymentRepo.createForInvoice(BUSINESS_ID, invoice.id, {
      paymentDate: "2026-07-08",
      amount: 100000,
      method: "cash",
      notes: null,
    });

    expect(updated.payments[0]?.customerId).toBe(invoice.customerId);
    expect(updated.status).toBe("paid");
  });
});
