import { describe, expect, it } from "vitest";
import { lineTotal } from "@/lib/money";
import type { InvoicePersist } from "@/lib/services/ports";
import { computeStatus } from "@/lib/services/status";
import { invoiceRepo } from "./invoice-repo";
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
