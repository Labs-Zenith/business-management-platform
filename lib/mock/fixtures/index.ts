import { lineTotal } from "@/lib/money";
import { computeStatus } from "@/lib/services/status";
import type {
  Business,
  Customer,
  Employee,
  Expense,
  InventoryMovement,
  Invoice,
  InvoiceItem,
  Payment,
  PayrollPayment,
  Product,
} from "@/lib/services/ports";
import type { MockStore, Profile } from "../store";
import { generateId, nextInvoiceNumber } from "../store";
import {
  BUSINESS_ID,
  BUSINESS_ID_2,
  businessFixture,
  businessFixture2,
  customerFixtures,
  demoProfileFixture,
  demoProfileFixture2,
  employeeFixtures,
  expenseFixtures,
  inventoryMovementFixtures,
  invoiceFixtures,
  payrollPaymentFixtures,
  productFixtures,
} from "./data";

/**
 * Minimal seed (both businesses + both demo profiles only, no customers/
 * invoices/payments) — used for the cookie-backed persistence path (see
 * `lib/mock/cookie-persistence.ts`), where the whole store round-trips
 * through an httpOnly cookie on every request. The full `seedFixtures`
 * dataset (~8 customers/~12 invoices) is too large to fit in a ~4KB
 * cookie; this keeps a fresh session small, and the user builds up their
 * own data (which does fit comfortably) from there. Both profiles are
 * seeded (not just the first) so the cookie-persistence path can still
 * demo the business switcher.
 */
export function seedMinimal(store: MockStore): void {
  const nowIso = new Date().toISOString();
  const laterIso = new Date(Date.now() + 1000).toISOString();
  store.businesses.set(BUSINESS_ID, { ...businessFixture, createdAt: nowIso, updatedAt: nowIso });
  store.businesses.set(BUSINESS_ID_2, { ...businessFixture2, createdAt: laterIso, updatedAt: laterIso });
  store.profiles.set(demoProfileFixture.id, { ...demoProfileFixture, createdAt: nowIso, updatedAt: nowIso });
  store.profiles.set(demoProfileFixture2.id, { ...demoProfileFixture2, createdAt: laterIso, updatedAt: laterIso });
}

function daysFromNow(offset: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

/** Populates an empty `MockStore` with the "Negocio Demo" seed data (both businesses/memberships). */
export function seedFixtures(store: MockStore): void {
  const now = new Date();
  const nowIso = now.toISOString();
  const laterIso = new Date(now.getTime() + 1000).toISOString();

  const business: Business = {
    ...businessFixture,
    createdAt: nowIso,
    updatedAt: nowIso,
  };
  store.businesses.set(business.id, business);

  const business2: Business = {
    ...businessFixture2,
    createdAt: laterIso,
    updatedAt: laterIso,
  };
  store.businesses.set(business2.id, business2);

  const profile: Profile = {
    ...demoProfileFixture,
    createdAt: nowIso,
    updatedAt: nowIso,
  };
  store.profiles.set(profile.id, profile);

  const profile2: Profile = {
    ...demoProfileFixture2,
    createdAt: laterIso,
    updatedAt: laterIso,
  };
  store.profiles.set(profile2.id, profile2);

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

  for (const expenseFixture of expenseFixtures) {
    const expense: Expense = {
      id: expenseFixture.id,
      businessId: BUSINESS_ID,
      category: expenseFixture.category,
      expenseDate: daysFromNow(expenseFixture.dayOffset),
      description: expenseFixture.description,
      amount: expenseFixture.amountInCents,
      notes: expenseFixture.notes,
      createdAt: nowIso,
      updatedAt: nowIso,
    };
    store.expenses.set(expense.id, expense);
  }

  for (const employeeFixture of employeeFixtures) {
    const employee: Employee = {
      id: employeeFixture.id,
      businessId: BUSINESS_ID,
      name: employeeFixture.name,
      baseSalary: employeeFixture.baseSalary,
      active: employeeFixture.active,
      createdAt: nowIso,
      updatedAt: nowIso,
    };
    store.employees.set(employee.id, employee);
  }

  for (const payrollPaymentFixture of payrollPaymentFixtures) {
    const payrollPayment: PayrollPayment = {
      id: payrollPaymentFixture.id,
      businessId: BUSINESS_ID,
      employeeId: payrollPaymentFixture.employeeId,
      amount: payrollPaymentFixture.amount,
      periodType: payrollPaymentFixture.periodType,
      periodStart: payrollPaymentFixture.periodStart,
      periodEnd: payrollPaymentFixture.periodEnd,
      paymentDate: daysFromNow(payrollPaymentFixture.paymentDayOffset),
      notes: payrollPaymentFixture.notes,
      createdAt: nowIso,
    };
    store.payrollPayments.set(payrollPayment.id, payrollPayment);
  }

  for (const productFixture of productFixtures) {
    const product: Product = {
      id: productFixture.id,
      businessId: BUSINESS_ID,
      name: productFixture.name,
      sku: productFixture.sku,
      unitCost: productFixture.unitCost,
      minStockThreshold: productFixture.minStockThreshold,
      active: productFixture.active,
      createdAt: nowIso,
      updatedAt: nowIso,
    };
    store.products.set(product.id, product);
  }

  for (const movementFixture of inventoryMovementFixtures) {
    const movement: InventoryMovement = {
      id: movementFixture.id,
      businessId: BUSINESS_ID,
      productId: movementFixture.productId,
      type: movementFixture.type,
      quantity: movementFixture.quantity,
      note: movementFixture.note,
      createdAt: daysFromNow(movementFixture.dayOffset) + "T00:00:00.000Z",
    };
    store.inventoryMovements.set(movement.id, movement);
  }
}
