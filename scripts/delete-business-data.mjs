import { parseArgs } from "node:util";
import postgres from "postgres";

/**
 * Deletes ALL transactional data + customers for a business (reverts a
 * `seed-demo.ts` run / cleans a demo), WITHOUT deleting the business,
 * profiles, or auth user — unless `--include-business` is passed.
 *
 * Run with the env loaded (same connection-string resolution order as
 * `scripts/db-migrate.mjs`/`scripts/create-user.mjs`):
 *
 *   node --env-file=.env.local scripts/delete-business-data.mjs --business-id <uuid> [--include-business]
 *
 * Deletion order (children before parents, all `WHERE business_id = $1`
 * except `invoice_items`, which is scoped via a subquery over this
 * business's `invoices`): payments, invoice_items, invoices,
 * inventory_movements, products, payroll_payments, employees, expenses,
 * customers, invoice_sequences, audit_log. Wrapped in a single transaction —
 * all-or-nothing. With `--include-business`, additionally deletes `profiles`
 * for the business and the `businesses` row itself (auth.users is never
 * touched by this script).
 */

const { values } = parseArgs({
  options: {
    "business-id": { type: "string" },
    "include-business": { type: "boolean", default: false },
  },
});

const businessId = values["business-id"];
const includeBusiness = values["include-business"];

function fail(message) {
  console.error(`[delete-business-data] ${message}`);
  process.exit(1);
}

if (!businessId) {
  fail("Missing --business-id <uuid>. Refusing to run without an explicit target.");
}

const connectionString =
  process.env.POSTGRES_URL ||
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL_NON_POOLING ||
  process.env.DATABASE_URL_UNPOOLED;

if (!connectionString) {
  fail("Missing a Postgres connection string (POSTGRES_URL / DATABASE_URL) in the environment (use --env-file=.env.local).");
}

const sql = postgres(connectionString, { prepare: false });

async function main() {
  const [business] = await sql`SELECT id, name FROM businesses WHERE id = ${businessId}`;
  if (!business) {
    fail(`Business ${businessId} does not exist.`);
  }

  console.log(`[delete-business-data] Deleting all data for business "${business.name}" (${businessId})...`);

  const counts = await sql.begin(async (tx) => {
    const counts = {};

    const payments = await tx`DELETE FROM payments WHERE business_id = ${businessId} RETURNING id`;
    counts.payments = payments.length;

    const invoiceItems = await tx`
      DELETE FROM invoice_items
      WHERE invoice_id IN (SELECT id FROM invoices WHERE business_id = ${businessId})
      RETURNING id
    `;
    counts.invoice_items = invoiceItems.length;

    const invoices = await tx`DELETE FROM invoices WHERE business_id = ${businessId} RETURNING id`;
    counts.invoices = invoices.length;

    const inventoryMovements = await tx`DELETE FROM inventory_movements WHERE business_id = ${businessId} RETURNING id`;
    counts.inventory_movements = inventoryMovements.length;

    const products = await tx`DELETE FROM products WHERE business_id = ${businessId} RETURNING id`;
    counts.products = products.length;

    const payrollPayments = await tx`DELETE FROM payroll_payments WHERE business_id = ${businessId} RETURNING id`;
    counts.payroll_payments = payrollPayments.length;

    const employees = await tx`DELETE FROM employees WHERE business_id = ${businessId} RETURNING id`;
    counts.employees = employees.length;

    const expenses = await tx`DELETE FROM expenses WHERE business_id = ${businessId} RETURNING id`;
    counts.expenses = expenses.length;

    const customers = await tx`DELETE FROM customers WHERE business_id = ${businessId} RETURNING id`;
    counts.customers = customers.length;

    const invoiceSequences = await tx`DELETE FROM invoice_sequences WHERE business_id = ${businessId} RETURNING business_id`;
    counts.invoice_sequences = invoiceSequences.length;

    const auditLog = await tx`DELETE FROM audit_log WHERE business_id = ${businessId} RETURNING id`;
    counts.audit_log = auditLog.length;

    if (includeBusiness) {
      const profiles = await tx`DELETE FROM profiles WHERE business_id = ${businessId} RETURNING id`;
      counts.profiles = profiles.length;

      const businesses = await tx`DELETE FROM businesses WHERE id = ${businessId} RETURNING id`;
      counts.businesses = businesses.length;
    }

    return counts;
  });

  console.log("[delete-business-data] Done. Rows deleted per table:");
  for (const [table, count] of Object.entries(counts)) {
    console.log(`  ${table}: ${count}`);
  }
  if (!includeBusiness) {
    console.log("[delete-business-data] Business row and profiles were kept (pass --include-business to delete them too).");
  }
}

main()
  .then(() => sql.end({ timeout: 5 }))
  .then(() => process.exit(0))
  .catch(async (error) => {
    console.error("[delete-business-data] Failed:", error);
    await sql.end({ timeout: 5 });
    process.exit(1);
  });
