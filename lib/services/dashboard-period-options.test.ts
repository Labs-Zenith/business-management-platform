import { describe, expect, it } from "vitest";
import { repositories } from "@/lib/services/repositories";
import type { InvoicePersist, Session } from "@/lib/services/ports";
import { lineTotal } from "@/lib/money";
import { parsePeriodParam } from "./dashboard-period";
import { createExpense } from "./expense-service";
import { getPeriodOptions } from "./dashboard-period-options";

/**
 * Exercises the REAL mock store (matching `dashboard-service.test.ts`'s
 * technique) with a fresh random business id per test, so cross-business
 * isolation is a genuine leak detector rather than a `resetStore()`
 * dependency.
 */

const NOW = new Date(2026, 6, 15); // 15 July 2026, local
const CURRENT_MONTH = "2026-07";

function newBusinessId(): string {
  return crypto.randomUUID();
}

function sessionFor(businessId: string): Session {
  return { userId: crypto.randomUUID(), businessId, email: "owner@negocio.test", role: "admin" };
}

function invoicePersist(customerId: string, issueDate: string): InvoicePersist {
  const item = { description: "Servicio", quantity: 1, unitPrice: 10_000 };
  const itemLineTotal = lineTotal(item.quantity, item.unitPrice);
  return {
    customerId,
    issueDate,
    dueDate: null,
    items: [{ ...item, productId: null, catalogProductId: null, lineTotal: itemLineTotal }],
    subtotal: itemLineTotal,
    total: itemLineTotal,
    status: "pending",
    notes: null,
  };
}

async function monthValues(session: Session): Promise<string[]> {
  const { months } = await getPeriodOptions(session, NOW);
  return months.map((option) => option.value);
}

describe("getPeriodOptions", () => {
  it("offers only months with real movement, unioned across invoices, payments and expenses", async () => {
    const businessId = newBusinessId();
    const session = sessionFor(businessId);
    const customer = await repositories.customers.create(businessId, { name: "Cliente Meses" });

    const invoice = await repositories.invoices.create(businessId, invoicePersist(customer.id, "2026-03-10"));
    await repositories.payments.createForInvoice(businessId, invoice.id, {
      paymentDate: "2026-05-02",
      amount: 4_000,
      method: "cash",
    });
    await createExpense(session, {
      category: "otro",
      expenseDate: "2026-01-20",
      description: "Gasto de enero",
      amount: 7_000,
    });

    // Newest first, no month the business never touched (no 2026-02, no
    // 2026-04, no 2026-06), and the current month always present.
    expect(await monthValues(session)).toEqual(["2026-07", "2026-05", "2026-03", "2026-01"]);
  });

  it("always includes the current month, even for a business with no data at all", async () => {
    const session = sessionFor(newBusinessId());

    // Without this the dropdown would be empty for a brand-new business — and
    // empty on the first days of any month with no movement yet — leaving no
    // way to select the very period the page already defaults to.
    expect(await monthValues(session)).toEqual([CURRENT_MONTH]);
  });

  it("never leaks another business's months", async () => {
    const businessA = newBusinessId();
    const businessB = newBusinessId();
    const customerB = await repositories.customers.create(businessB, { name: "Cliente Ajeno" });
    await repositories.invoices.create(businessB, invoicePersist(customerB.id, "2025-11-05"));

    expect(await monthValues(sessionFor(businessA))).toEqual([CURRENT_MONTH]);
    expect(await monthValues(sessionFor(businessB))).toEqual([CURRENT_MONTH, "2025-11"]);
  });

  it("dedupes a month that has several kinds of movement", async () => {
    const businessId = newBusinessId();
    const session = sessionFor(businessId);
    const customer = await repositories.customers.create(businessId, { name: "Cliente Duplicado" });

    const invoice = await repositories.invoices.create(businessId, invoicePersist(customer.id, "2026-02-03"));
    await repositories.payments.createForInvoice(businessId, invoice.id, {
      paymentDate: "2026-02-20",
      amount: 1_000,
      method: "cash",
    });
    await createExpense(session, {
      category: "otro",
      expenseDate: "2026-02-25",
      description: "Gasto de febrero",
      amount: 500,
    });

    expect(await monthValues(session)).toEqual([CURRENT_MONTH, "2026-02"]);
  });

  it("offers months older than any fixed window, since the data reaches back that far", async () => {
    const businessId = newBusinessId();
    const session = sessionFor(businessId);
    const customer = await repositories.customers.create(businessId, { name: "Cliente Antiguo" });
    await repositories.invoices.create(businessId, invoicePersist(customer.id, "2019-04-08"));

    expect(await monthValues(session)).toContain("2019-04");
  });

  it("offers the presets unconditionally, without touching any repository", async () => {
    const { presets } = await getPeriodOptions(sessionFor(newBusinessId()), NOW);

    expect(presets.map((option) => option.value)).toEqual(["last30", "last3", "last6", "thisYear", "all"]);
  });

  it("only offers values parsePeriodParam accepts, so no option can bounce back to the default", async () => {
    const businessId = newBusinessId();
    const session = sessionFor(businessId);
    const customer = await repositories.customers.create(businessId, { name: "Cliente Coherencia" });
    await repositories.invoices.create(businessId, invoicePersist(customer.id, "2019-04-08"));

    const { presets, months } = await getPeriodOptions(session, NOW);

    // The invariant that keeps the data-driven list and the (deliberately
    // unbounded) validity rule from drifting apart.
    for (const option of [...presets, ...months]) {
      expect(parsePeriodParam(option.value, NOW).key).toBe(option.value);
    }
  });
});
