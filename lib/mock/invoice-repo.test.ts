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

  it("edits successfully when the invoice is only PARTIALLY paid (payment < total), recomputing totals/status from the REAL paidAmount (not hardcoded 0)", async () => {
    resetStore();
    const created = await invoiceRepo.create(BUSINESS_ID, buildInvoicePersist());
    const PAID_AMOUNT = 30000;
    await paymentRepo.createForInvoice(BUSINESS_ID, created.id, {
      paymentDate: "2026-07-08",
      amount: PAID_AMOUNT,
      method: "cash",
      notes: null,
    });

    // New total (60000) is >= the amount already paid (30000), so the edit
    // is allowed even though the invoice is not zero-payment anymore.
    // Fixture built with the invoice's REAL paidAmount (30000), not a
    // hardcoded 0 — a realistic status computation for a partially-paid
    // invoice being edited.
    const expectedStatus = computeStatus(60000, PAID_AMOUNT, "2026-08-09", new Date("2026-07-09"));
    const updated = await invoiceRepo.update(
      BUSINESS_ID,
      created.id,
      buildInvoiceUpdatePersist({ status: expectedStatus }),
    );

    expect(updated).not.toBeNull();
    expect(updated!.total).toBe(60000);
    expect(updated!.items).toHaveLength(1);
    expect(updated!.items[0]!.description).toBe("Servicio editado");
    // The persisted status round-trips: it is the REAL-paidAmount-derived
    // status ("partially_paid"), not "pending" (which is what a hardcoded
    // paid=0 computation would have produced).
    expect(expectedStatus).toBe("partially_paid");
    expect(updated!.status).toBe("partially_paid");
  });

  it("edits successfully at the EXACT boundary where the new total equals paidAmount (invoice closes to fully-collected), actually replacing items — this is the boundary a header-updated-before-items bug would silently corrupt", async () => {
    resetStore();
    const created = await invoiceRepo.create(BUSINESS_ID, buildInvoicePersist());
    const PAID_AMOUNT = 60000;
    await paymentRepo.createForInvoice(BUSINESS_ID, created.id, {
      paymentDate: "2026-07-08",
      amount: PAID_AMOUNT,
      method: "cash",
      notes: null,
    });

    // The edit's new total (60000) EXACTLY equals paidAmount (60000) — a
    // legal edit that closes the invoice to exactly what's been paid.
    const expectedStatus = computeStatus(60000, PAID_AMOUNT, "2026-08-09", new Date("2026-07-09"));
    const updated = await invoiceRepo.update(
      BUSINESS_ID,
      created.id,
      buildInvoiceUpdatePersist({ status: expectedStatus }),
    );

    expect(updated).not.toBeNull();
    // Items are ACTUALLY replaced: the new item is present, the old one gone.
    expect(updated!.items).toHaveLength(1);
    expect(updated!.items[0]!.description).toBe("Servicio editado");
    expect(updated!.items.some((item) => item.description === "Servicio")).toBe(false);
    // Header total equals the new total...
    expect(updated!.total).toBe(60000);
    // ...and is consistent with the sum of the (new) item lineTotals — this
    // is the assertion that would fail if the header committed while the
    // items silently failed to replace under the pre-fix bug.
    const itemsTotal = updated!.items.reduce((sum, item) => sum + item.lineTotal, 0);
    expect(updated!.total).toBe(itemsTotal);
    expect(updated!.status).toBe(expectedStatus);
  });

  it("edits successfully as a NO-OP total change while partially paid (new total == current total)", async () => {
    resetStore();
    const created = await invoiceRepo.create(BUSINESS_ID, buildInvoicePersist());
    const PAID_AMOUNT = 40000;
    await paymentRepo.createForInvoice(BUSINESS_ID, created.id, {
      paymentDate: "2026-07-08",
      amount: PAID_AMOUNT,
      method: "cash",
      notes: null,
    });

    // buildInvoicePersist's total is 100000; edit with the SAME total (a
    // no-op total change), just replacing the item description.
    const noOpTotalUpdate = buildInvoiceUpdatePersist({
      items: [{ description: "Servicio editado", quantity: 1, unitPrice: 100000, lineTotal: 100000 }],
      subtotal: 100000,
      total: 100000,
      status: computeStatus(100000, PAID_AMOUNT, "2026-08-09", new Date("2026-07-09")),
    });
    const updated = await invoiceRepo.update(BUSINESS_ID, created.id, noOpTotalUpdate);

    expect(updated).not.toBeNull();
    expect(updated!.total).toBe(100000);
    expect(updated!.items).toHaveLength(1);
    expect(updated!.items[0]!.description).toBe("Servicio editado");
    expect(updated!.status).toBe("partially_paid");
  });

  it("rejects with CONFLICT and mutates NOTHING once the invoice is FULLY paid (payments sum == total)", async () => {
    resetStore();
    const created = await invoiceRepo.create(BUSINESS_ID, buildInvoicePersist());
    await paymentRepo.createForInvoice(BUSINESS_ID, created.id, {
      paymentDate: "2026-07-08",
      amount: 100000,
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

  it("rejects with CONFLICT and mutates NOTHING when the submitted new total is below the amount already paid", async () => {
    resetStore();
    const created = await invoiceRepo.create(BUSINESS_ID, buildInvoicePersist());
    await paymentRepo.createForInvoice(BUSINESS_ID, created.id, {
      paymentDate: "2026-07-08",
      amount: 80000,
      method: "cash",
      notes: null,
    });

    // Invoice is not fully paid (balance 20000 > 0), but the edit's new total
    // (60000) is BELOW the amount already paid (80000) -> rejected.
    await expect(invoiceRepo.update(BUSINESS_ID, created.id, buildInvoiceUpdatePersist())).rejects.toMatchObject({
      code: "CONFLICT",
    });

    const unchanged = await invoiceRepo.getById(BUSINESS_ID, created.id);
    expect(unchanged!.total).toBe(100000);
    expect(unchanged!.items).toHaveLength(1);
    expect(unchanged!.items[0]!.description).toBe("Servicio");
    expect(unchanged!.notes).toBeNull();
  });

  it("rejects with CONFLICT (not a generic Error) as an ApiError instance for a fully-paid invoice", async () => {
    resetStore();
    const created = await invoiceRepo.create(BUSINESS_ID, buildInvoicePersist());
    await paymentRepo.createForInvoice(BUSINESS_ID, created.id, {
      paymentDate: "2026-07-08",
      amount: 100000,
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
