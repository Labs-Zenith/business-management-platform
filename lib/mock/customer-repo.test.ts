import { beforeEach, describe, expect, it } from "vitest";
import type { Customer, Invoice, Payment, PipelineCard } from "@/lib/services/ports";
import { createCustomerRepository } from "./customer-repo";
import { createEmptyStore, type MockStore } from "./store";

/**
 * Scoped to `delete`, the mock twin of `lib/db/customer-repo.ts#delete` — the
 * only method on this repo with a real decision to make. Unlike products,
 * customers are NOT unconditionally deletable: anything financial pointing at
 * them blocks the delete, because `invoices.customer_id`/`payments.customer_id`
 * are `NOT NULL` in Postgres and an invoice resolves the customer's name by
 * lookup. `pipeline_cards.customerId` IS nullable, so those detach instead.
 */

const BUSINESS_ID = "10000000-0000-4000-8000-000000000001";
const OTHER_BUSINESS_ID = "10000000-0000-4000-8000-000000000099";

let store: MockStore;

beforeEach(() => {
  store = createEmptyStore();
});

async function seedCustomer(businessId = BUSINESS_ID): Promise<Customer> {
  return createCustomerRepository(store).create(businessId, { name: "Cliente Prueba" });
}

function seedInvoice(customerId: string, id = "invoice-1", businessId = BUSINESS_ID) {
  const invoice = {
    id,
    businessId,
    customerId,
    invoiceTypeId: "type-1",
    number: "FAC-0001",
    issueDate: "2026-07-01",
    dueDate: null,
    subtotal: 100000,
    total: 100000,
    status: "pending",
    notes: null,
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-01T00:00:00.000Z",
  } as unknown as Invoice;
  store.invoices.set(id, invoice);
  return invoice;
}

function seedPayment(customerId: string, id = "payment-1", businessId = BUSINESS_ID) {
  const payment = {
    id,
    businessId,
    invoiceId: "invoice-1",
    customerId,
    paymentDate: "2026-07-02",
    amount: 50000,
    method: null,
    methodId: null,
    notes: null,
    createdAt: "2026-07-02T00:00:00.000Z",
    updatedAt: "2026-07-02T00:00:00.000Z",
  } as unknown as Payment;
  store.payments.set(id, payment);
  return payment;
}

function seedPipelineCard(customerId: string | null, id = "card-1", businessId = BUSINESS_ID) {
  const card = {
    id,
    businessId,
    customerId,
    title: "Venta de prueba",
    stage: "nuevo",
    amount: 500000,
    notes: null,
    position: 0,
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-01T00:00:00.000Z",
  } as unknown as PipelineCard;
  store.pipelineCards.set(id, card);
  return card;
}

describe("createCustomerRepository.delete", () => {
  it("removes a customer with no invoices or payments", async () => {
    const repo = createCustomerRepository(store);
    const customer = await seedCustomer();

    await expect(repo.delete(BUSINESS_ID, customer.id)).resolves.toEqual({ outcome: "deleted" });

    expect(store.customers.has(customer.id)).toBe(false);
  });

  it("detaches pipeline cards instead of deleting them, leaving other cards alone", async () => {
    const repo = createCustomerRepository(store);
    const customer = await seedCustomer();
    const other = await seedCustomer();
    seedPipelineCard(customer.id, "card-1");
    seedPipelineCard(other.id, "card-2");

    await repo.delete(BUSINESS_ID, customer.id);

    expect(store.pipelineCards.size).toBe(2);
    expect(store.pipelineCards.get("card-1")!.customerId).toBeNull();
    // The card itself survives, keeping its title and amount.
    expect(store.pipelineCards.get("card-1")!.title).toBe("Venta de prueba");
    expect(store.pipelineCards.get("card-2")!.customerId).toBe(other.id);
  });

  it("refuses with the invoice count when the customer has invoices", async () => {
    const repo = createCustomerRepository(store);
    const customer = await seedCustomer();
    seedInvoice(customer.id, "invoice-1");
    seedInvoice(customer.id, "invoice-2");

    await expect(repo.delete(BUSINESS_ID, customer.id)).resolves.toEqual({
      outcome: "conflict",
      invoiceCount: 2,
      paymentCount: 0,
    });

    expect(store.customers.has(customer.id)).toBe(true);
  });

  it("refuses with the payment count when the customer has payments", async () => {
    const repo = createCustomerRepository(store);
    const customer = await seedCustomer();
    seedPayment(customer.id);

    await expect(repo.delete(BUSINESS_ID, customer.id)).resolves.toEqual({
      outcome: "conflict",
      invoiceCount: 0,
      paymentCount: 1,
    });

    expect(store.customers.has(customer.id)).toBe(true);
  });

  it("reports both counts when the customer has invoices AND payments", async () => {
    const repo = createCustomerRepository(store);
    const customer = await seedCustomer();
    seedInvoice(customer.id, "invoice-1");
    seedPayment(customer.id, "payment-1");

    await expect(repo.delete(BUSINESS_ID, customer.id)).resolves.toEqual({
      outcome: "conflict",
      invoiceCount: 1,
      paymentCount: 1,
    });
  });

  it("ignores another customer's invoices when deciding", async () => {
    const repo = createCustomerRepository(store);
    const customer = await seedCustomer();
    const other = await seedCustomer();
    seedInvoice(other.id, "invoice-1");

    await expect(repo.delete(BUSINESS_ID, customer.id)).resolves.toEqual({ outcome: "deleted" });
  });

  it("returns not_found for a cross-business id, leaving the customer untouched", async () => {
    const repo = createCustomerRepository(store);
    const customer = await seedCustomer();

    await expect(repo.delete(OTHER_BUSINESS_ID, customer.id)).resolves.toEqual({ outcome: "not_found" });

    expect(store.customers.has(customer.id)).toBe(true);
  });

  it("returns not_found for an unknown id", async () => {
    const repo = createCustomerRepository(store);

    await expect(repo.delete(BUSINESS_ID, "20000000-0000-4000-8000-00000000dead")).resolves.toEqual({
      outcome: "not_found",
    });
  });
});
