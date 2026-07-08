import { lineTotal } from "@/lib/money";
import { computeStatus } from "@/lib/services/status";
import type { Business, Customer, Invoice, InvoiceItem, Payment } from "@/lib/services/ports";
import type { MockStore, Profile } from "../store";
import { generateId, nextInvoiceNumber } from "../store";
import {
  BUSINESS_ID,
  businessFixture,
  customerFixtures,
  demoProfileFixture,
  invoiceFixtures,
} from "./data";

function daysFromNow(offset: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

/** Populates an empty `MockStore` with the "Negocio Demo" seed data. */
export function seedFixtures(store: MockStore): void {
  const now = new Date();
  const nowIso = now.toISOString();

  const business: Business = {
    ...businessFixture,
    createdAt: nowIso,
    updatedAt: nowIso,
  };
  store.businesses.set(business.id, business);

  const profile: Profile = {
    ...demoProfileFixture,
    createdAt: nowIso,
    updatedAt: nowIso,
  };
  store.profiles.set(profile.userId, profile);

  for (const customerFixture of customerFixtures) {
    const customer: Customer = {
      ...customerFixture,
      businessId: BUSINESS_ID,
      createdAt: nowIso,
      updatedAt: nowIso,
    };
    store.customers.set(customer.id, customer);
  }

  for (const invoiceFixture of invoiceFixtures) {
    const items: InvoiceItem[] = invoiceFixture.items.map((item) => ({
      id: generateId(),
      invoiceId: invoiceFixture.id,
      description: item.description,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      lineTotal: lineTotal(item.quantity, item.unitPrice),
    }));
    const subtotal = items.reduce((sum, item) => sum + item.lineTotal, 0);
    const total = subtotal;

    const dueDate = invoiceFixture.dueDayOffset === null ? null : daysFromNow(invoiceFixture.dueDayOffset);
    const paidAmount = invoiceFixture.payments.reduce((sum, payment) => sum + payment.amount, 0);
    const status = computeStatus(total, paidAmount, dueDate, now);

    const number = nextInvoiceNumber(store, BUSINESS_ID);

    const invoice: Invoice = {
      id: invoiceFixture.id,
      businessId: BUSINESS_ID,
      customerId: invoiceFixture.customerId,
      number,
      issueDate: daysFromNow(invoiceFixture.issueDayOffset),
      dueDate,
      subtotal,
      total,
      status,
      notes: invoiceFixture.notes,
      createdAt: nowIso,
      updatedAt: nowIso,
    };
    store.invoices.set(invoice.id, invoice);
    for (const item of items) {
      store.invoiceItems.set(item.id, item);
    }

    for (const paymentFixture of invoiceFixture.payments) {
      const payment: Payment = {
        id: generateId(),
        businessId: BUSINESS_ID,
        invoiceId: invoice.id,
        customerId: invoice.customerId,
        paymentDate: daysFromNow(paymentFixture.dayOffset),
        amount: paymentFixture.amount,
        method: paymentFixture.method,
        notes: paymentFixture.notes,
        createdAt: nowIso,
        updatedAt: nowIso,
      };
      store.payments.set(payment.id, payment);
    }
  }
}
