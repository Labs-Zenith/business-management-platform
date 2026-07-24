import { parseArgs } from "node:util";
import { repositories } from "@/lib/services/repositories";
import { isDbConfigured } from "@/lib/db/client";
import { computeStatus } from "@/lib/services/status";
import {
  customerFixtures,
  invoiceFixtures,
  expenseFixtures,
  employeeFixtures,
  payrollPaymentFixtures,
  productFixtures,
  inventoryMovementFixtures,
} from "@/lib/mock/fixtures/data";

/**
 * Populates ANY existing business with a full synthetic demo dataset
 * (reusable — not tied to the fixed demo `BUSINESS_ID`). Run with the DB env
 * loaded:
 *
 *   npx tsx --env-file=.env.local scripts/seed-demo.ts --business-id <uuid>
 *
 * REPO-REUSE APPROACH (chosen over raw SQL): imports `repositories` from
 * `@/lib/services/repositories` — the SAME wiring point the app itself uses
 * — and calls into the real DB repos (`isDbConfigured` is true once
 * `POSTGRES_URL`/`DATABASE_URL` is present via `--env-file`). This gets
 * per-(business,type) invoice numbering (`FAC-000N`), the atomic payment
 * overpay guard, the payroll+expense double-insert, and the inventory
 * floor-at-zero guard "for free" — all invariants that would otherwise have
 * to be hand-replicated in raw SQL. Every repo's `create` takes plain
 * catalog CODES (`category`, `method`, `type`, `periodType`) and resolves
 * the matching catalog id server-side by code — see `lib/db/*-repo.ts` —
 * so this script never needs to look up catalog ids itself.
 *
 * Fixture data (`@/lib/mock/fixtures/data`) supplies CONTENT only (names,
 * amounts, relationships, `dayOffset`s) — every id is regenerated fresh by
 * the repos (`gen_random_uuid()`), and fixture-id -> created-id maps
 * (`customerId`, `invoiceId`, `employeeId`, `productId`) are used to remap
 * relationships (invoice.customerId, payment.invoiceId, inventory
 * movement.productId, ...). Each fixture `dayOffset` is converted to a real
 * ISO date relative to "now" (the moment this script runs), exactly like the
 * mock backend does at runtime.
 *
 * Idempotency: NOT guaranteed (by design — this seeds fresh demo data into
 * an empty/demo business; re-running adds a SECOND full set of everything).
 * Use `scripts/delete-business-data.mjs` first to revert a previous seed.
 */

function dayOffsetToIso(offset: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      "business-id": { type: "string" },
    },
  });

  const businessId = values["business-id"];
  if (!businessId) {
    console.error("[seed-demo] Missing --business-id <uuid>.");
    process.exit(1);
  }

  if (!isDbConfigured) {
    console.error("[seed-demo] No database configured (POSTGRES_URL/DATABASE_URL missing). Aborting.");
    process.exit(1);
  }

  const business = await repositories.business.getById(businessId);
  if (!business) {
    console.error(`[seed-demo] Business ${businessId} does not exist. Aborting.`);
    process.exit(1);
  }

  console.log(`[seed-demo] Seeding demo data into business "${business.name}" (${businessId})...`);

  // ---------------------------------------------------------------------
  // Customers
  // ---------------------------------------------------------------------
  const customerIdMap = new Map<string, string>(); // fixtureCustomerId -> createdCustomerId
  for (const fixture of customerFixtures) {
    const created = await repositories.customers.create(businessId, {
      name: fixture.name,
      documentNumber: fixture.documentNumber,
      email: fixture.email,
      phone: fixture.phone,
      address: fixture.address,
      notes: fixture.notes,
    });
    customerIdMap.set(fixture.id, created.id);
    // `create` always returns `isActive: true`; a couple of fixtures are
    // deliberately inactive to demonstrate the active/inactive filter, so
    // flip those explicitly via `update`.
    if (!fixture.isActive) {
      await repositories.customers.update(businessId, created.id, { isActive: false });
    }
  }
  console.log(`[seed-demo] Created ${customerIdMap.size} customers.`);

  // ---------------------------------------------------------------------
  // Invoices (+ items) and their payments
  // ---------------------------------------------------------------------
  const invoiceIdMap = new Map<string, string>(); // fixtureInvoiceId -> createdInvoiceId
  let paymentsCreated = 0;
  for (const fixture of invoiceFixtures) {
    const createdCustomerId = customerIdMap.get(fixture.customerId);
    if (!createdCustomerId) {
      throw new Error(`[seed-demo] No created customer for fixture customerId ${fixture.customerId}`);
    }

    const items = fixture.items.map((item) => ({
      description: item.description,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      // Demo-seed invoice lines are synthetic/free-text — never linked to a
      // real inventory product.
      productId: null,
      lineTotal: item.quantity * item.unitPrice,
    }));
    const total = items.reduce((sum, item) => sum + item.lineTotal, 0);
    const dueDate = fixture.dueDayOffset === null ? null : dayOffsetToIso(fixture.dueDayOffset);
    // Mirrors `invoice-service.ts#createInvoice`: at creation time there are
    // no payments yet (`paid = 0`), so `status` is computed from `total`/
    // `dueDate` alone — real status (post-payments) is always recomputed at
    // read time by `withFinance`/`computeStatus`, this initial value is just
    // what gets persisted in the `status` column at insert.
    const status = computeStatus(total, 0, dueDate);

    const invoice = await repositories.invoices.create(businessId, {
      customerId: createdCustomerId,
      issueDate: dayOffsetToIso(fixture.issueDayOffset),
      dueDate,
      items,
      subtotal: total,
      total,
      status,
      notes: fixture.notes,
    });
    invoiceIdMap.set(fixture.id, invoice.id);

    for (const payment of fixture.payments) {
      await repositories.payments.createForInvoice(businessId, invoice.id, {
        paymentDate: dayOffsetToIso(payment.dayOffset),
        amount: payment.amount,
        method: payment.method,
        notes: payment.notes,
      });
      paymentsCreated++;
    }
  }
  console.log(`[seed-demo] Created ${invoiceIdMap.size} invoices with ${paymentsCreated} payments.`);

  // ---------------------------------------------------------------------
  // Expenses
  // ---------------------------------------------------------------------
  for (const fixture of expenseFixtures) {
    await repositories.expenses.create(businessId, {
      category: fixture.category,
      expenseDate: dayOffsetToIso(fixture.dayOffset),
      description: fixture.description,
      amount: fixture.amountInCents,
      notes: fixture.notes,
    });
  }
  console.log(`[seed-demo] Created ${expenseFixtures.length} expenses.`);

  // ---------------------------------------------------------------------
  // Employees
  // ---------------------------------------------------------------------
  const employeeIdMap = new Map<string, string>(); // fixtureEmployeeId -> createdEmployeeId
  for (const fixture of employeeFixtures) {
    const created = await repositories.employees.create(businessId, {
      name: fixture.name,
      baseSalary: fixture.baseSalary,
    });
    employeeIdMap.set(fixture.id, created.id);
    if (!fixture.active) {
      await repositories.employees.update(businessId, created.id, { active: false });
    }
  }
  console.log(`[seed-demo] Created ${employeeIdMap.size} employees.`);

  // ---------------------------------------------------------------------
  // Payroll payments (each also inserts a matching `category:'nomina'` expense)
  // ---------------------------------------------------------------------
  for (const fixture of payrollPaymentFixtures) {
    const createdEmployeeId = employeeIdMap.get(fixture.employeeId);
    if (!createdEmployeeId) {
      throw new Error(`[seed-demo] No created employee for fixture employeeId ${fixture.employeeId}`);
    }
    await repositories.payroll.create(
      businessId,
      {
        employeeId: createdEmployeeId,
        amount: fixture.amount,
        periodType: fixture.periodType,
        periodStart: fixture.periodStart,
        periodEnd: fixture.periodEnd,
        paymentDate: dayOffsetToIso(fixture.paymentDayOffset),
        notes: fixture.notes,
      },
      {
        category: "nomina",
        expenseDate: dayOffsetToIso(fixture.paymentDayOffset),
        description: `Nómina - ${fixture.notes ?? "pago de nómina"}`,
        amount: fixture.amount,
        notes: fixture.notes,
      }
    );
  }
  console.log(`[seed-demo] Created ${payrollPaymentFixtures.length} payroll payments (+ matching expenses).`);

  // ---------------------------------------------------------------------
  // Products
  // ---------------------------------------------------------------------
  const productIdMap = new Map<string, string>(); // fixtureProductId -> createdProductId
  for (const fixture of productFixtures) {
    const created = await repositories.products.create(businessId, {
      name: fixture.name,
      sku: fixture.sku,
      unitCost: fixture.unitCost,
    });
    productIdMap.set(fixture.id, created.id);
    if (!fixture.active) {
      await repositories.products.update(businessId, created.id, { active: false });
    }
  }
  console.log(`[seed-demo] Created ${productIdMap.size} products.`);

  // ---------------------------------------------------------------------
  // Inventory movements
  // ---------------------------------------------------------------------
  for (const fixture of inventoryMovementFixtures) {
    const createdProductId = productIdMap.get(fixture.productId);
    if (!createdProductId) {
      throw new Error(`[seed-demo] No created product for fixture productId ${fixture.productId}`);
    }
    await repositories.inventory.create(businessId, {
      productId: createdProductId,
      type: fixture.type,
      quantity: fixture.quantity,
      note: fixture.note,
    });
  }
  console.log(`[seed-demo] Created ${inventoryMovementFixtures.length} inventory movements.`);

  console.log("[seed-demo] Done. Summary:");
  console.log(`  customers:           ${customerIdMap.size}`);
  console.log(`  invoices:            ${invoiceIdMap.size}`);
  console.log(`  payments:            ${paymentsCreated}`);
  console.log(`  expenses:            ${expenseFixtures.length}`);
  console.log(`  employees:           ${employeeIdMap.size}`);
  console.log(`  payroll payments:    ${payrollPaymentFixtures.length}`);
  console.log(`  products:            ${productIdMap.size}`);
  console.log(`  inventory movements: ${inventoryMovementFixtures.length}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("[seed-demo] Failed:", error);
    process.exit(1);
  });
