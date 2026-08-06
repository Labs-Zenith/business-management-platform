import { describe, expect, it } from "vitest";
import { lineTotal } from "@/lib/money";
import { ApiError } from "@/lib/server/api-error";
import type { InvoicePersist } from "@/lib/services/ports";
import { computeStatus } from "@/lib/services/status";
import { createCustomerRepository } from "./customer-repo";
import { createInventoryMovementRepository } from "./inventory-repo";
import { createInvoiceRepository, invoiceRepo } from "./invoice-repo";
import { createPaymentRepository, paymentRepo } from "./payment-repo";
import { createProductRepository } from "./product-repo";
import { customerFixtures } from "./fixtures/data";
import { createEmptyStore, resetStore } from "./store";

const BUSINESS_ID = "10000000-0000-4000-8000-000000000001";
const CUSTOMER_ID = customerFixtures[0].id;

function buildInvoicePersist(overrides: Partial<InvoicePersist> = {}): InvoicePersist {
  const items = [{ description: "Servicio", quantity: 1, unitPrice: 100000, productId: null as string | null, catalogProductId: null as string | null }];
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
  const items = [{ description: "Servicio editado", quantity: 2, unitPrice: 30000, productId: null as string | null, catalogProductId: null as string | null }];
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
      items: [{ description: "Servicio editado", quantity: 1, unitPrice: 100000, productId: null, catalogProductId: null, lineTotal: 100000 }],
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

/**
 * Product-line inventory decrement (invoice-item-product change) — safety
 * critical, mock-backend behavioral proof (mirrors
 * `lib/mock/inventory-repo.test.ts`'s floor-at-zero guard tests). Uses an
 * ISOLATED `createEmptyStore()` per test (not the shared fixture-seeded
 * singleton) so stock arithmetic is exact and never depends on fixture data.
 */
describe("invoiceRepo — product-line inventory decrement (safety-critical)", () => {
  const LOCAL_BUSINESS_ID = "10000000-0000-4000-8000-000000000042";

  async function setup(initialStock = 10) {
    const store = createEmptyStore();
    const customers = createCustomerRepository(store);
    const products = createProductRepository(store);
    const movements = createInventoryMovementRepository(store);
    const invoices = createInvoiceRepository(store);
    const payments = createPaymentRepository(store);

    const customer = await customers.create(LOCAL_BUSINESS_ID, { name: "Cliente Local" });
    const product = await products.create(LOCAL_BUSINESS_ID, { name: "Shampoo", unitCost: 1000 });
    await movements.create(LOCAL_BUSINESS_ID, { productId: product.id, type: "in", quantity: initialStock });

    return { store, customers, products, movements, invoices, payments, customer, product };
  }

  function persistWithItems(
    customerId: string,
    items: Array<{ description: string; quantity: number; unitPrice: number; productId: string | null }>,
  ): InvoicePersist {
    const withTotals = items.map((item) => ({
      ...item,
      catalogProductId: null,
      lineTotal: lineTotal(item.quantity, item.unitPrice),
    }));
    const subtotal = withTotals.reduce((sum, item) => sum + item.lineTotal, 0);
    return {
      customerId,
      issueDate: "2026-07-20",
      dueDate: "2026-08-20",
      items: withTotals,
      subtotal,
      total: subtotal,
      status: computeStatus(subtotal, 0, "2026-08-20", new Date("2026-07-20")),
      notes: null,
    };
  }

  it("create: a product-linked line decrements stock via an `out` movement, and the returned item exposes productId", async () => {
    const { invoices, products, customer, product } = await setup();

    const detail = await invoices.create(
      LOCAL_BUSINESS_ID,
      persistWithItems(customer.id, [{ description: product.name, quantity: 4, unitPrice: 25000, productId: product.id }]),
    );

    expect(detail.items).toHaveLength(1);
    expect(detail.items[0]!.productId).toBe(product.id);

    const found = await products.getById(LOCAL_BUSINESS_ID, product.id);
    expect(found!.currentQuantity).toBe(6); // 10 - 4
  });

  it("create: overdraw throws VALIDATION_ERROR and persists NOTHING — no invoice, no items, no movement (rollback)", async () => {
    const { invoices, products, store, customer, product } = await setup();

    await expect(
      invoices.create(
        LOCAL_BUSINESS_ID,
        persistWithItems(customer.id, [{ description: product.name, quantity: 999, unitPrice: 25000, productId: product.id }]),
      ),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });

    expect(store.invoices.size).toBe(0);
    expect(store.invoiceItems.size).toBe(0);
    const found = await products.getById(LOCAL_BUSINESS_ID, product.id);
    expect(found!.currentQuantity).toBe(10); // unchanged
  });

  it("create: propagates an ApiError instance (not a generic Error) on overdraw", async () => {
    const { invoices, customer, product } = await setup();

    await expect(
      invoices.create(
        LOCAL_BUSINESS_ID,
        persistWithItems(customer.id, [{ description: product.name, quantity: 999, unitPrice: 25000, productId: product.id }]),
      ),
    ).rejects.toBeInstanceOf(ApiError);
  });

  it("create: a fractional quantity on a product-linked line is rejected with VALIDATION_ERROR — no invoice, no items, no movement (PARITY with the DB backend's INTEGER column)", async () => {
    const { invoices, products, store, customer, product } = await setup();

    await expect(
      invoices.create(
        LOCAL_BUSINESS_ID,
        persistWithItems(customer.id, [{ description: product.name, quantity: 2.5, unitPrice: 25000, productId: product.id }]),
      ),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });

    expect(store.invoices.size).toBe(0);
    expect(store.invoiceItems.size).toBe(0);
    const found = await products.getById(LOCAL_BUSINESS_ID, product.id);
    expect(found!.currentQuantity).toBe(10); // unchanged
  });

  it("create: a fractional quantity on a free-text 'Otro' line is still allowed (it never touches inventory)", async () => {
    const { invoices, customer } = await setup();

    const detail = await invoices.create(
      LOCAL_BUSINESS_ID,
      persistWithItems(customer.id, [{ description: "Servicio de asesoria", quantity: 1.5, unitPrice: 25000, productId: null }]),
    );

    expect(detail.items[0]!.quantity).toBe(1.5);
    expect(detail.items[0]!.productId).toBeNull();
  });

  it("create: a free-text 'Otro' line (productId null) never touches inventory", async () => {
    const { invoices, products, customer, product } = await setup();

    const detail = await invoices.create(
      LOCAL_BUSINESS_ID,
      persistWithItems(customer.id, [{ description: "Servicio de asesoria", quantity: 1, unitPrice: 50000, productId: null }]),
    );

    expect(detail.items[0]!.productId).toBeNull();
    const found = await products.getById(LOCAL_BUSINESS_ID, product.id);
    expect(found!.currentQuantity).toBe(10); // unchanged
  });

  it("create: two lines of the SAME product accumulate correctly against ONE running stock check", async () => {
    const { invoices, products, customer, product } = await setup();

    await invoices.create(
      LOCAL_BUSINESS_ID,
      persistWithItems(customer.id, [
        { description: product.name, quantity: 4, unitPrice: 25000, productId: product.id },
        { description: product.name, quantity: 6, unitPrice: 25000, productId: product.id },
      ]),
    );

    const found = await products.getById(LOCAL_BUSINESS_ID, product.id);
    expect(found!.currentQuantity).toBe(0); // 10 - 4 - 6
  });

  it("create: a quantity EXACTLY equal to current stock succeeds (inclusive boundary) and drains the product to 0", async () => {
    const { invoices, products, customer, product } = await setup();

    const detail = await invoices.create(
      LOCAL_BUSINESS_ID,
      persistWithItems(customer.id, [{ description: product.name, quantity: 10, unitPrice: 25000, productId: product.id }]),
    );

    expect(detail.items[0]!.productId).toBe(product.id);
    const found = await products.getById(LOCAL_BUSINESS_ID, product.id);
    expect(found!.currentQuantity).toBe(0); // 10 - 10, drained exactly to zero, no throw
  });

  it("create: rejects the SECOND line of the same product once the running balance is exhausted, persisting nothing", async () => {
    const { invoices, products, store, customer, product } = await setup();

    await expect(
      invoices.create(
        LOCAL_BUSINESS_ID,
        persistWithItems(customer.id, [
          { description: product.name, quantity: 6, unitPrice: 25000, productId: product.id },
          { description: product.name, quantity: 5, unitPrice: 25000, productId: product.id },
        ]),
      ),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });

    expect(store.invoices.size).toBe(0);
    const found = await products.getById(LOCAL_BUSINESS_ID, product.id);
    expect(found!.currentQuantity).toBe(10); // unchanged
  });

  it("update: reverses the OLD product line and applies the NEW one, leaving NET stock correct", async () => {
    const { invoices, products, customer, product } = await setup();
    const created = await invoices.create(
      LOCAL_BUSINESS_ID,
      persistWithItems(customer.id, [{ description: product.name, quantity: 4, unitPrice: 25000, productId: product.id }]),
    );
    // Stock is now 6 (10 - 4).

    await invoices.update(
      LOCAL_BUSINESS_ID,
      created.id,
      persistWithItems(customer.id, [{ description: product.name, quantity: 2, unitPrice: 25000, productId: product.id }]),
    );

    // Reversed the old 4 (back to 10), then decremented the new 2 -> 8.
    const found = await products.getById(LOCAL_BUSINESS_ID, product.id);
    expect(found!.currentQuantity).toBe(8);
  });

  it("update: two NEW lines of the SAME product accumulate sequentially against the running balance (FIX 5)", async () => {
    const { invoices, products, customer, product } = await setup();
    const created = await invoices.create(
      LOCAL_BUSINESS_ID,
      persistWithItems(customer.id, [{ description: product.name, quantity: 4, unitPrice: 25000, productId: product.id }]),
    );
    // Stock is now 6 (10 - 4).

    await invoices.update(
      LOCAL_BUSINESS_ID,
      created.id,
      persistWithItems(customer.id, [
        { description: product.name, quantity: 3, unitPrice: 25000, productId: product.id },
        { description: product.name, quantity: 5, unitPrice: 25000, productId: product.id },
      ]),
    );

    // Old 4 reversed (back to 10), then the combined new lines (3 + 5 = 8)
    // decremented sequentially -> 10 - 8 = 2.
    const found = await products.getById(LOCAL_BUSINESS_ID, product.id);
    expect(found!.currentQuantity).toBe(2);
  });

  it("update: two NEW lines of the SAME product whose COMBINED quantity exceeds stock rolls back the WHOLE edit", async () => {
    const { invoices, products, customer, product } = await setup();
    const created = await invoices.create(
      LOCAL_BUSINESS_ID,
      persistWithItems(customer.id, [{ description: product.name, quantity: 4, unitPrice: 25000, productId: product.id }]),
    );
    // Stock is now 6 (10 - 4). Restoring the old 4 gives a running balance of
    // 10 for the new lines below; their combined quantity (6 + 5 = 11)
    // exceeds that 10, so the SECOND new line must overdraw and roll back.

    await expect(
      invoices.update(
        LOCAL_BUSINESS_ID,
        created.id,
        persistWithItems(customer.id, [
          { description: product.name, quantity: 6, unitPrice: 25000, productId: product.id },
          { description: product.name, quantity: 5, unitPrice: 25000, productId: product.id },
        ]),
      ),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });

    // Rejected edit mutates nothing — the OLD reservation (4 consumed, stock
    // at 6) is untouched.
    const found = await products.getById(LOCAL_BUSINESS_ID, product.id);
    expect(found!.currentQuantity).toBe(6);
    const detail = await invoices.getById(LOCAL_BUSINESS_ID, created.id);
    expect(detail!.items).toHaveLength(1);
    expect(detail!.items[0]!.quantity).toBe(4);
  });

  it("update: switching a line from one product to another reverses the old and decrements the new", async () => {
    const { invoices, products, movements, customer, product } = await setup();
    const secondProduct = await products.create(LOCAL_BUSINESS_ID, { name: "Tijera", unitCost: 8000 });
    await movements.create(LOCAL_BUSINESS_ID, { productId: secondProduct.id, type: "in", quantity: 5 });

    const created = await invoices.create(
      LOCAL_BUSINESS_ID,
      persistWithItems(customer.id, [{ description: product.name, quantity: 4, unitPrice: 25000, productId: product.id }]),
    );

    await invoices.update(
      LOCAL_BUSINESS_ID,
      created.id,
      persistWithItems(customer.id, [{ description: secondProduct.name, quantity: 3, unitPrice: 8000, productId: secondProduct.id }]),
    );

    expect((await products.getById(LOCAL_BUSINESS_ID, product.id))!.currentQuantity).toBe(10); // fully restored
    expect((await products.getById(LOCAL_BUSINESS_ID, secondProduct.id))!.currentQuantity).toBe(2); // 5 - 3
  });

  it("update: dropping a product line entirely (edited to 'Otro') fully restores that product's stock", async () => {
    const { invoices, products, customer, product } = await setup();
    const created = await invoices.create(
      LOCAL_BUSINESS_ID,
      persistWithItems(customer.id, [{ description: product.name, quantity: 4, unitPrice: 25000, productId: product.id }]),
    );

    await invoices.update(
      LOCAL_BUSINESS_ID,
      created.id,
      persistWithItems(customer.id, [{ description: "Servicio libre", quantity: 1, unitPrice: 10000, productId: null }]),
    );

    const found = await products.getById(LOCAL_BUSINESS_ID, product.id);
    expect(found!.currentQuantity).toBe(10); // fully restored, no new decrement
  });

  it("update: overdraw on the NEW line throws VALIDATION_ERROR and leaves the OLD line's reservation untouched (no partial reversal)", async () => {
    const { invoices, products, customer, product } = await setup();
    const created = await invoices.create(
      LOCAL_BUSINESS_ID,
      persistWithItems(customer.id, [{ description: product.name, quantity: 4, unitPrice: 25000, productId: product.id }]),
    );
    // Stock is now 6.

    await expect(
      invoices.update(
        LOCAL_BUSINESS_ID,
        created.id,
        persistWithItems(customer.id, [{ description: product.name, quantity: 999, unitPrice: 25000, productId: product.id }]),
      ),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });

    // Rejected edit mutates nothing — old reservation is intact.
    const found = await products.getById(LOCAL_BUSINESS_ID, product.id);
    expect(found!.currentQuantity).toBe(6);
    const detail = await invoices.getById(LOCAL_BUSINESS_ID, created.id);
    expect(detail!.items[0]!.quantity).toBe(4);
  });

  it("update: a rejected edit (fully paid) never reverses or decrements stock, even when the invoice has a product line", async () => {
    const { invoices, products, payments, customer, product } = await setup();
    const created = await invoices.create(
      LOCAL_BUSINESS_ID,
      persistWithItems(customer.id, [{ description: product.name, quantity: 4, unitPrice: 25000, productId: product.id }]),
    );
    // Stock is now 6 (10 - 4). Pay the invoice in FULL to lock the edit.
    await payments.createForInvoice(LOCAL_BUSINESS_ID, created.id, {
      paymentDate: "2026-07-20",
      amount: created.total,
      method: "cash",
      notes: null,
    });

    await expect(
      invoices.update(
        LOCAL_BUSINESS_ID,
        created.id,
        persistWithItems(customer.id, [{ description: product.name, quantity: 1, unitPrice: 25000, productId: product.id }]),
      ),
    ).rejects.toMatchObject({ code: "CONFLICT" });

    // Fully-paid edit-lock rejects BEFORE any stock reversal/decrement.
    const found = await products.getById(LOCAL_BUSINESS_ID, product.id);
    expect(found!.currentQuantity).toBe(6);
  });
});

describe("createInvoiceRepository.listActiveMonths", () => {
  const LOCAL_BUSINESS_ID = "10000000-0000-4000-8000-000000000077";
  const FOREIGN_BUSINESS_ID = "10000000-0000-4000-8000-000000000078";

  // The default store (not `createEmptyStore()`): `create` resolves the
  // customer through the store, and `buildInvoicePersist` points at a fixture
  // customer that only exists there.
  it("returns each issue month exactly once, scoped to the business", async () => {
    resetStore();

    await invoiceRepo.create(LOCAL_BUSINESS_ID, buildInvoicePersist({ issueDate: "2026-07-08" }));
    await invoiceRepo.create(LOCAL_BUSINESS_ID, buildInvoicePersist({ issueDate: "2026-07-25" })); // same month
    await invoiceRepo.create(LOCAL_BUSINESS_ID, buildInvoicePersist({ issueDate: "2025-12-01" }));
    await invoiceRepo.create(FOREIGN_BUSINESS_ID, buildInvoicePersist({ issueDate: "2024-02-02" }));

    const months = await invoiceRepo.listActiveMonths(LOCAL_BUSINESS_ID);

    expect([...months].sort()).toEqual(["2025-12", "2026-07"]);
    expect(months).not.toContain("2024-02");
  });

  it("returns an empty list for a business with no invoices", async () => {
    resetStore();

    expect(await invoiceRepo.listActiveMonths("10000000-0000-4000-8000-000000000079")).toEqual([]);
  });
});

/**
 * A credit note is a RETURN: the customer gives the goods back, so its lines
 * must ADD units to inventory rather than consume them. Before this, every
 * invoice type emitted `out` movements, so recording a return actually
 * subtracted the returned stock a second time.
 */
describe("createInvoiceRepository — credit note returns stock", () => {
  const LOCAL_BUSINESS_ID = "10000000-0000-4000-8000-000000000043";

  async function setup(initialStock: number) {
    const store = createEmptyStore();
    const customers = createCustomerRepository(store);
    const products = createProductRepository(store);
    const movements = createInventoryMovementRepository(store);
    const invoices = createInvoiceRepository(store);

    const customer = await customers.create(LOCAL_BUSINESS_ID, { name: "Cliente Devolución" });
    const product = await products.create(LOCAL_BUSINESS_ID, { name: "Crema", unitCost: 40000 });
    if (initialStock > 0) {
      await movements.create(LOCAL_BUSINESS_ID, { productId: product.id, type: "in", quantity: initialStock });
    }

    const creditNoteTypeId = [...store.invoiceTypes.values()].find((t) => t.code === "nota_credito")!.id;
    const saleTypeId = [...store.invoiceTypes.values()].find((t) => t.code === "venta")!.id;

    return { store, products, invoices, customer, product, creditNoteTypeId, saleTypeId };
  }

  function persist(
    customerId: string,
    productId: string,
    quantity: number,
    invoiceTypeId?: string,
  ): InvoicePersist {
    const total = lineTotal(quantity, 40000);
    return {
      customerId,
      issueDate: "2026-08-04",
      dueDate: null,
      invoiceTypeId,
      items: [{ description: "Crema", quantity, unitPrice: 40000, productId, catalogProductId: null, lineTotal: total }],
      subtotal: total,
      total,
      status: computeStatus(total, 0, null, new Date("2026-08-04")),
      notes: null,
    };
  }

  async function stockOf(store: ReturnType<typeof createEmptyStore>, productId: string) {
    const products = createProductRepository(store);
    return (await products.getById(LOCAL_BUSINESS_ID, productId))!.currentQuantity;
  }

  it("ADDS the returned units back to stock — the user's case: return 2, stock goes up by 2", async () => {
    const { store, invoices, customer, product, saleTypeId, creditNoteTypeId } = await setup(10);

    // Sell 2 -> 8 left.
    await invoices.create(LOCAL_BUSINESS_ID, persist(customer.id, product.id, 2, saleTypeId));
    expect(await stockOf(store, product.id)).toBe(8);

    // The customer returns both -> back to 10, NOT down to 6.
    await invoices.create(LOCAL_BUSINESS_ID, persist(customer.id, product.id, 2, creditNoteTypeId));
    expect(await stockOf(store, product.id)).toBe(10);
  });

  it("records the movement as 'in', not 'out'", async () => {
    const { store, invoices, customer, product, creditNoteTypeId } = await setup(5);

    await invoices.create(LOCAL_BUSINESS_ID, persist(customer.id, product.id, 3, creditNoteTypeId));

    const returned = [...store.inventoryMovements.values()].filter((m) => m.quantity === 3);
    expect(returned).toHaveLength(1);
    expect(returned[0]!.type).toBe("in");
  });

  it("is never blocked by insufficient stock — a return only adds", async () => {
    // Zero on hand: a SALE of 1 would be rejected, a return must not be.
    const { store, invoices, customer, product, creditNoteTypeId } = await setup(0);
    expect(await stockOf(store, product.id)).toBe(0);

    await expect(
      invoices.create(LOCAL_BUSINESS_ID, persist(customer.id, product.id, 4, creditNoteTypeId)),
    ).resolves.toBeDefined();

    expect(await stockOf(store, product.id)).toBe(4);
  });

  it("still refuses a SALE that overdraws, proving the guard is direction-specific", async () => {
    const { invoices, customer, product, saleTypeId } = await setup(1);

    await expect(
      invoices.create(LOCAL_BUSINESS_ID, persist(customer.id, product.id, 2, saleTypeId)),
    ).rejects.toBeInstanceOf(ApiError);
  });

  it("numbers a credit note with the NC prefix, on its own sequence", async () => {
    const { invoices, customer, product, creditNoteTypeId } = await setup(0);

    const created = await invoices.create(LOCAL_BUSINESS_ID, persist(customer.id, product.id, 1, creditNoteTypeId));

    expect(created.number).toBe("NC-0001");
  });

  it("editing a credit note reverses with 'out' and re-applies 'in', netting the new quantity", async () => {
    const { store, invoices, customer, product, creditNoteTypeId } = await setup(10);

    const note = await invoices.create(LOCAL_BUSINESS_ID, persist(customer.id, product.id, 3, creditNoteTypeId));
    expect(await stockOf(store, product.id)).toBe(13); // 10 + 3 returned

    // Correct the return down to 1 unit -> 10 + 1.
    await invoices.update(LOCAL_BUSINESS_ID, note.id, persist(customer.id, product.id, 1, creditNoteTypeId));

    expect(await stockOf(store, product.id)).toBe(11);
  });

  it("refuses to reverse a return whose units were already re-sold", async () => {
    const { store, invoices, customer, product, creditNoteTypeId, saleTypeId } = await setup(0);

    // Return 2 (stock 0 -> 2), then sell them again (2 -> 0).
    const note = await invoices.create(LOCAL_BUSINESS_ID, persist(customer.id, product.id, 2, creditNoteTypeId));
    await invoices.create(LOCAL_BUSINESS_ID, persist(customer.id, product.id, 2, saleTypeId));
    expect(await stockOf(store, product.id)).toBe(0);

    // Editing the note now would have to take those 2 back out — impossible.
    await expect(
      invoices.update(LOCAL_BUSINESS_ID, note.id, persist(customer.id, product.id, 1, creditNoteTypeId)),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });

    // And the rejection left stock untouched.
    expect(await stockOf(store, product.id)).toBe(0);
  });
});

/**
 * Voiding — the logical deletion for an invoice created by mistake. The
 * cases that matter are the ones where money and stock have to end up back
 * where they started, and the one where they cannot.
 */
describe("createInvoiceRepository.void", () => {
  const LOCAL_BUSINESS_ID = "10000000-0000-4000-8000-000000000044";
  const VOID_DATA = { reason: "Se facturó al cliente equivocado", voidedBy: "user-1" };

  async function setup(initialStock: number) {
    const store = createEmptyStore();
    const customers = createCustomerRepository(store);
    const products = createProductRepository(store);
    const movements = createInventoryMovementRepository(store);
    const invoices = createInvoiceRepository(store);
    const payments = createPaymentRepository(store);

    const customer = await customers.create(LOCAL_BUSINESS_ID, { name: "Cliente Anulación" });
    const product = await products.create(LOCAL_BUSINESS_ID, { name: "Crema", unitCost: 40000 });
    if (initialStock > 0) {
      await movements.create(LOCAL_BUSINESS_ID, { productId: product.id, type: "in", quantity: initialStock });
    }
    const typeId = (code: string) => [...store.invoiceTypes.values()].find((t) => t.code === code)!.id;

    return { store, products, invoices, payments, customers, customer, product, typeId };
  }

  function persist(customerId: string, productId: string, quantity: number, invoiceTypeId?: string): InvoicePersist {
    const total = lineTotal(quantity, 40000);
    return {
      customerId,
      issueDate: "2026-08-05",
      dueDate: null,
      invoiceTypeId,
      items: [{ description: "Crema", quantity, unitPrice: 40000, productId, catalogProductId: null, lineTotal: total }],
      subtotal: total,
      total,
      status: computeStatus(total, 0, null, new Date("2026-08-05")),
      notes: null,
    };
  }

  async function stockOf(store: ReturnType<typeof createEmptyStore>, productId: string) {
    return (await createProductRepository(store).getById(LOCAL_BUSINESS_ID, productId))!.currentQuantity;
  }

  it("gives the stock back and stops the money counting — the mistaken-invoice case", async () => {
    const { store, invoices, payments, customers, customer, product, typeId } = await setup(10);
    const invoice = await invoices.create(LOCAL_BUSINESS_ID, persist(customer.id, product.id, 4, typeId("venta")));
    await payments.createForInvoice(LOCAL_BUSINESS_ID, invoice.id, {
      paymentDate: "2026-08-05",
      amount: 60000,
      method: null,
      methodId: null,
      notes: null,
    });
    expect(await stockOf(store, product.id)).toBe(6);

    const voided = await invoices.void(LOCAL_BUSINESS_ID, invoice.id, VOID_DATA);

    expect(voided!.status).toBe("voided");
    expect(voided!.voidReason).toBe(VOID_DATA.reason);
    expect(voided!.voidedBy).toBe("user-1");
    // Stock is back where it started, and the invoice counts for nothing.
    expect(await stockOf(store, product.id)).toBe(10);
    expect(voided!.paidAmount).toBe(0);
    expect(voided!.balance).toBe(0);
    // The customer owes nothing again.
    const detail = await customers.getById(LOCAL_BUSINESS_ID, customer.id);
    expect(detail!.balance).toBe(0);
    expect(detail!.totalInvoiced).toBe(0);
    expect(detail!.totalPaid).toBe(0);
  });

  it("keeps the rows: nothing is deleted, only marked", async () => {
    const { store, invoices, payments, customer, product, typeId } = await setup(5);
    const invoice = await invoices.create(LOCAL_BUSINESS_ID, persist(customer.id, product.id, 1, typeId("venta")));
    await payments.createForInvoice(LOCAL_BUSINESS_ID, invoice.id, {
      paymentDate: "2026-08-05", amount: 1000, method: null, methodId: null, notes: null,
    });

    await invoices.void(LOCAL_BUSINESS_ID, invoice.id, VOID_DATA);

    expect(store.invoices.has(invoice.id)).toBe(true);
    expect([...store.invoiceItems.values()].filter((i) => i.invoiceId === invoice.id)).toHaveLength(1);
    const invoicePayments = [...store.payments.values()].filter((p) => p.invoiceId === invoice.id);
    expect(invoicePayments).toHaveLength(1);
    expect(invoicePayments[0]!.voidedAt).not.toBeNull();
  });

  it("disappears from the default list but is reachable with status=voided", async () => {
    const { invoices, customer, product, typeId } = await setup(5);
    const invoice = await invoices.create(LOCAL_BUSINESS_ID, persist(customer.id, product.id, 1, typeId("venta")));
    await invoices.void(LOCAL_BUSINESS_ID, invoice.id, VOID_DATA);

    const live = await invoices.list(LOCAL_BUSINESS_ID, { page: 1, pageSize: 20 });
    expect(live.data.some((i) => i.id === invoice.id)).toBe(false);

    const onlyVoided = await invoices.list(LOCAL_BUSINESS_ID, { page: 1, pageSize: 20, status: "voided" });
    expect(onlyVoided.data.map((i) => i.id)).toEqual([invoice.id]);
  });

  it("takes back the stock a CREDIT NOTE had returned", async () => {
    const { store, invoices, customer, product, typeId } = await setup(10);
    const note = await invoices.create(LOCAL_BUSINESS_ID, persist(customer.id, product.id, 3, typeId("nota_credito")));
    expect(await stockOf(store, product.id)).toBe(13);

    await invoices.void(LOCAL_BUSINESS_ID, note.id, VOID_DATA);

    expect(await stockOf(store, product.id)).toBe(10);
  });

  it("REFUSES when the units a credit note returned were already re-sold, changing nothing", async () => {
    const { store, invoices, customer, product, typeId } = await setup(0);
    const note = await invoices.create(LOCAL_BUSINESS_ID, persist(customer.id, product.id, 2, typeId("nota_credito")));
    await invoices.create(LOCAL_BUSINESS_ID, persist(customer.id, product.id, 2, typeId("venta")));
    expect(await stockOf(store, product.id)).toBe(0);

    await expect(invoices.void(LOCAL_BUSINESS_ID, note.id, VOID_DATA)).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
    });

    // Zero mutation on rejection: still live, still zero stock.
    expect(await stockOf(store, product.id)).toBe(0);
    expect(store.invoices.get(note.id)!.voidedAt).toBeNull();
  });

  it("refuses to void twice", async () => {
    const { invoices, customer, product, typeId } = await setup(5);
    const invoice = await invoices.create(LOCAL_BUSINESS_ID, persist(customer.id, product.id, 1, typeId("venta")));
    await invoices.void(LOCAL_BUSINESS_ID, invoice.id, VOID_DATA);

    await expect(invoices.void(LOCAL_BUSINESS_ID, invoice.id, VOID_DATA)).rejects.toMatchObject({
      code: "CONFLICT",
    });
  });

  it("returns null for a cross-business id, leaving the invoice live", async () => {
    const { store, invoices, customer, product, typeId } = await setup(5);
    const invoice = await invoices.create(LOCAL_BUSINESS_ID, persist(customer.id, product.id, 1, typeId("venta")));

    await expect(invoices.void("10000000-0000-4000-8000-000000000099", invoice.id, VOID_DATA)).resolves.toBeNull();

    expect(store.invoices.get(invoice.id)!.voidedAt).toBeNull();
  });
});
