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
 * as before. `auth` is gated independently on `isSupabaseConfigured` (Fase 2
 * of the Supabase migration, see `docs/db-driver-migration.md`): the real
 * Supabase Auth adapter (`lib/supabase/auth-adapter.ts`) replaces the mock
 * adapter once `NEXT_PUBLIC_SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` are
 * set, so local dev/tests without those env vars keep using the mock
 * exactly as before.
 */

import { authAdapter } from "@/lib/mock/auth-adapter";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { supabaseAuthAdapter } from "@/lib/supabase/auth-adapter";
import { auditLogRepo as mockAuditLogRepo } from "@/lib/mock/audit-log-repo";
import { catalogRepo as mockCatalogRepo } from "@/lib/mock/catalog-repo";
import { businessRepo as mockBusinessRepo } from "@/lib/mock/business-repo";
import { customerRepo as mockCustomerRepo } from "@/lib/mock/customer-repo";
import { employeeRepo as mockEmployeeRepo } from "@/lib/mock/employee-repo";
import { expenseRepo as mockExpenseRepo } from "@/lib/mock/expense-repo";
import { inventoryRepo as mockInventoryRepo } from "@/lib/mock/inventory-repo";
import { invoiceRepo as mockInvoiceRepo } from "@/lib/mock/invoice-repo";
import { paymentRepo as mockPaymentRepo } from "@/lib/mock/payment-repo";
import { payrollRepo as mockPayrollRepo } from "@/lib/mock/payroll-repo";
import { pipelineRepo as mockPipelineRepo } from "@/lib/mock/pipeline-repo";
import { productRepo as mockProductRepo } from "@/lib/mock/product-repo";

import { isDbConfigured } from "@/lib/db/client";
import { auditLogRepo as dbAuditLogRepo } from "@/lib/db/audit-log-repo";
import { catalogRepo as dbCatalogRepo } from "@/lib/db/catalog-repo";
import { businessRepo as dbBusinessRepo } from "@/lib/db/business-repo";
import { customerRepo as dbCustomerRepo } from "@/lib/db/customer-repo";
import { employeeRepo as dbEmployeeRepo } from "@/lib/db/employee-repo";
import { expenseRepo as dbExpenseRepo } from "@/lib/db/expense-repo";
import { inventoryRepo as dbInventoryRepo } from "@/lib/db/inventory-repo";
import { invoiceRepo as dbInvoiceRepo } from "@/lib/db/invoice-repo";
import { paymentRepo as dbPaymentRepo } from "@/lib/db/payment-repo";
import { payrollRepo as dbPayrollRepo } from "@/lib/db/payroll-repo";
import { pipelineRepo as dbPipelineRepo } from "@/lib/db/pipeline-repo";
import { productRepo as dbProductRepo } from "@/lib/db/product-repo";

export const repositories = {
  auth: isSupabaseConfigured ? supabaseAuthAdapter : authAdapter,
  business: isDbConfigured ? dbBusinessRepo : mockBusinessRepo,
  customers: isDbConfigured ? dbCustomerRepo : mockCustomerRepo,
  invoices: isDbConfigured ? dbInvoiceRepo : mockInvoiceRepo,
  payments: isDbConfigured ? dbPaymentRepo : mockPaymentRepo,
  expenses: isDbConfigured ? dbExpenseRepo : mockExpenseRepo,
  employees: isDbConfigured ? dbEmployeeRepo : mockEmployeeRepo,
  payroll: isDbConfigured ? dbPayrollRepo : mockPayrollRepo,
  products: isDbConfigured ? dbProductRepo : mockProductRepo,
  inventory: isDbConfigured ? dbInventoryRepo : mockInventoryRepo,
  auditLog: isDbConfigured ? dbAuditLogRepo : mockAuditLogRepo,
  catalog: isDbConfigured ? dbCatalogRepo : mockCatalogRepo,
  pipeline: isDbConfigured ? dbPipelineRepo : mockPipelineRepo,
};
