/**
 * Single wiring/swap point for data access (see `ports.ts`).
 *
 * This is the ONLY file (besides `lib/mock/**` itself) allowed to import the
 * mock implementations. UI, schemas, and the rest of `lib/services` must
 * depend only on the `ports.ts` types and import repositories from here.
 * Swapping to real Supabase later means rewriting `lib/mock/*` and this
 * file only — keep this file minimal, no business logic.
 */

import { authAdapter } from "@/lib/mock/auth-adapter";
import { businessRepo } from "@/lib/mock/business-repo";
import { customerRepo } from "@/lib/mock/customer-repo";
import { invoiceRepo } from "@/lib/mock/invoice-repo";
import { paymentRepo } from "@/lib/mock/payment-repo";

export const repositories = {
  auth: authAdapter,
  business: businessRepo,
  customers: customerRepo,
  invoices: invoiceRepo,
  payments: paymentRepo,
};
