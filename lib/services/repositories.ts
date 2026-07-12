/**
 * Single wiring/swap point for data access (see `ports.ts`).
 *
 * This is the ONLY file (besides `lib/mock/**`/`lib/db/**` themselves)
 * allowed to import concrete repository implementations. UI, schemas, and
 * the rest of `lib/services` must depend only on the `ports.ts` types and
 * import repositories from here.
 *
 * Picks the real Postgres (Neon) backend when a database is configured
 * (`isDbConfigured`, i.e. `POSTGRES_URL`/`DATABASE_URL` is set — Vercel
 * injects this automatically once a Neon database is attached), so local
 * dev without a database keeps using the zero-setup in-memory mock exactly
 * as before. `auth` always stays the mock adapter: it only depends on
 * fixed demo constants (see `lib/mock/fixtures/data.ts`), which are seeded
 * identically in both backends, so there's nothing to swap there.
 */

import { authAdapter } from "@/lib/mock/auth-adapter";
import { businessRepo as mockBusinessRepo } from "@/lib/mock/business-repo";
import { customerRepo as mockCustomerRepo } from "@/lib/mock/customer-repo";
import { expenseRepo as mockExpenseRepo } from "@/lib/mock/expense-repo";
import { invoiceRepo as mockInvoiceRepo } from "@/lib/mock/invoice-repo";
import { paymentRepo as mockPaymentRepo } from "@/lib/mock/payment-repo";

import { isDbConfigured } from "@/lib/db/client";
import { businessRepo as dbBusinessRepo } from "@/lib/db/business-repo";
import { customerRepo as dbCustomerRepo } from "@/lib/db/customer-repo";
import { expenseRepo as dbExpenseRepo } from "@/lib/db/expense-repo";
import { invoiceRepo as dbInvoiceRepo } from "@/lib/db/invoice-repo";
import { paymentRepo as dbPaymentRepo } from "@/lib/db/payment-repo";

export const repositories = {
  auth: authAdapter,
  business: isDbConfigured ? dbBusinessRepo : mockBusinessRepo,
  customers: isDbConfigured ? dbCustomerRepo : mockCustomerRepo,
  invoices: isDbConfigured ? dbInvoiceRepo : mockInvoiceRepo,
  payments: isDbConfigured ? dbPaymentRepo : mockPaymentRepo,
  expenses: isDbConfigured ? dbExpenseRepo : mockExpenseRepo,
};
