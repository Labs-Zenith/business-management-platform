import { describe, expect, it } from "vitest";
import { lineTotal } from "@/lib/money";
import { ApiError } from "@/lib/server/api-error";
import type { InvoicePersist } from "@/lib/services/ports";
import { computeStatus } from "@/lib/services/status";
import { invoiceRepo } from "./invoice-repo";
import { paymentRepo } from "./payment-repo";
import { customerFixtures } from "./fixtures/data";
import { resetStore } from "./store";

const BUSINESS_ID = "10000000-0000-4000-8000-000000000001";
const CUSTOMER_ID = customerFixtures[0].id;

function buildInvoicePersist(overrides: Partial<InvoicePersist> = {}): InvoicePersist {
  const items = [{ description: "Servicio", quantity: 1, unitPrice: 100000 }];
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
    ...overrides,
  };
}

describe("invoiceRepo.create — concurrent numbering (safety-critical)", () => {
  it("assigns a unique, sequential number to every invoice even when N creates fire concurrently for the same business", async () => {
    resetStore();

    const CONCURRENCY = 20;

    // Fire genuinely concurrent creates via Promise.all — NOT sequential
    // awaits, which would trivially avoid any race condition.
    const created = await Promise.all(
      Array.from({ length: CONCURRENCY }, () => invoiceRepo.create(BUSINESS_ID, buildInvoicePersist())),
    );

    const numbers = created.map((invoice) => invoice.number);
    const uniqueNumbers = new Set(numbers);

    // No collisions/duplicates.
    expect(uniqueNumbers.size).toBe(CONCURRENCY);

    // Sequential: given the fixture seed already created some invoices for
    // this business, the newly created batch must extend that sequence with
    // no gaps and no repeats.
    const sortedSuffixes = numbers
      .map((number) => Number(number.split("-")[1]))
      .sort((a, b) => a - b);
    for (let i = 1; i < sortedSuffixes.length; i += 1) {
      expect(sortedSuffixes[i]).toBe(sortedSuffixes[i - 1] + 1);
    }
  });

  it("persists invoice header and items atomically and returns server-computed totals", async () => {
    resetStore();

    const invoice = await invoiceRepo.create(BUSINESS_ID, buildInvoicePersist());

    expect(invoice.total).toBe(100000);
    expect(invoice.items).toHaveLength(1);
    expect(invoice.items[0].lineTotal).toBe(100000);
    expect(invoice.status).toBe("pending");
  });
});

function buildInvoiceUpdatePersist(overrides: Partial<InvoicePersist> = {}): InvoicePersist {
  const items = [{ description: "Servicio editado", quantity: 2, unitPrice: 30000 }];
  const withTotals = items.map((item) => ({ ...item, lineTotal: lineTotal(item.quantity, item.unitPrice) }));
  const subtotal = withTotals.reduce((sum, item) => sum + item.lineTotal, 0);
  const total = subtotal;
  return {
    customerId: CUSTOMER_ID,
    issueDate: "2026-07-09",
    dueDate: "2026-08-09",
    items: withTotals,
    subtotal,
    total,
    status: computeStatus(total, 0, "2026-08-09", new Date("2026-07-09")),
    notes: "actualizado",
    ...overrides,
  };
}

describe("invoiceRepo.update — edit-lock (safety-critical)", () => {
  it("replaces items and recomputes subtotal/total/status on a zero-payment invoice, leaving number unchanged", async () => {
    resetStore();
    const created = await invoiceRepo.create(BUSINESS_ID, buildInvoicePersist());

    const updated = await invoiceRepo.update(BUSINESS_ID, created.id, buildInvoiceUpdatePersist());

    expect(updated).not.toBeNull();
    expect(updated!.number).toBe(created.number);
    expect(updated!.total).toBe(60000);
    expect(updated!.subtotal).toBe(60000);
    expect(updated!.items).toHaveLength(1);
    expect(updated!.items[0]!.description).toBe("Servicio editado");
    expect(updated!.notes).toBe("actualizado");
    expect(updated!.status).toBe("pending");
  });

  it("rejects with CONFLICT and mutates NOTHING once any payment has been recorded against the invoice", async () => {
    resetStore();
    const created = await invoiceRepo.create(BUSINESS_ID, buildInvoicePersist());
    await paymentRepo.createForInvoice(BUSINESS_ID, created.id, {
      paymentDate: "2026-07-08",
      amount: 1,
      method: "cash",
      notes: null,
    });

    await expect(invoiceRepo.update(BUSINESS_ID, created.id, buildInvoiceUpdatePersist())).rejects.toMatchObject({
      code: "CONFLICT",
    });

    const unchanged = await invoiceRepo.getById(BUSINESS_ID, created.id);
    expect(unchanged!.total).toBe(100000);
    expect(unchanged!.items).toHaveLength(1);
    expect(unchanged!.items[0]!.description).toBe("Servicio");
    expect(unchanged!.notes).toBeNull();
  });

  it("rejects with CONFLICT (not a generic Error) as an ApiError instance", async () => {
    resetStore();
    const created = await invoiceRepo.create(BUSINESS_ID, buildInvoicePersist());
    await paymentRepo.createForInvoice(BUSINESS_ID, created.id, {
      paymentDate: "2026-07-08",
      amount: 1,
      method: "cash",
      notes: null,
    });

    await expect(invoiceRepo.update(BUSINESS_ID, created.id, buildInvoiceUpdatePersist())).rejects.toBeInstanceOf(
      ApiError,
    );
  });

  it("returns null (not leaked, not thrown) for a cross-business update attempt, leaving the record unchanged", async () => {
    resetStore();
    const created = await invoiceRepo.create(BUSINESS_ID, buildInvoicePersist());
    const OTHER_BUSINESS_ID = "10000000-0000-4000-8000-000000000099";

    const result = await invoiceRepo.update(OTHER_BUSINESS_ID, created.id, buildInvoiceUpdatePersist());

    expect(result).toBeNull();
    const unchanged = await invoiceRepo.getById(BUSINESS_ID, created.id);
    expect(unchanged!.total).toBe(100000);
  });

  it("returns null for a missing invoice id", async () => {
    resetStore();

    const result = await invoiceRepo.update(
      BUSINESS_ID,
      "00000000-0000-4000-8000-000000000000",
      buildInvoiceUpdatePersist(),
    );

    expect(result).toBeNull();
  });
});
