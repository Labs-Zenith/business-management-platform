/**
 * Payment service, per
 * `openspec/changes/mocked-mvp-scaffold/specs/payments/spec.md` and
 * `openspec/changes/mocked-mvp-scaffold/design.md`'s "Payment flow (atomic,
 * overpay-safe)".
 *
 * SAFETY-CRITICAL: `createPayment` is a thin, honest wrapper around
 * `repositories.payments.createForInvoice` (PR1's
 * `lib/mock/payment-repo.ts`), which already performs the whole atomic
 * operation under `withLock(invoiceId)`: it scopes the invoice lookup to
 * `businessId` (cross-business or missing -> `NOT_FOUND`, matching
 * `invoice-service.ts`'s established convention), recalculates the current
 * balance, rejects `amount > balance` with NO mutation at all (not even a
 * partial one — proven in `payment-service.test.ts` by snapshotting the
 * store before/after), derives `customerId` from the invoice (never from
 * `data` — this function's own parameter type has no `customerId` field at
 * all, so even a forged/force-cast one is structurally impossible to read
 * here), and recomputes/persists the invoice's status via
 * `lib/services/status.ts` before returning.
 *
 * This function only ever forwards `session.businessId` (never a
 * client-supplied id) and the validated `amount`/`paymentDate`/`method`/
 * `notes` fields from `lib/schemas/payment.ts`'s `.strict()` schema.
 */

import { repositories } from "@/lib/services/repositories";
import type { InvoiceDetail, Paged, PaymentInput, PaymentListQuery, PaymentWithRefs, Session } from "@/lib/services/ports";

export type PaymentCreateInput = {
  paymentDate: string;
  amount: number;
  method?: string | null;
  notes?: string | null;
};

export async function listPayments(session: Session, query: PaymentListQuery): Promise<Paged<PaymentWithRefs>> {
  return repositories.payments.list(session.businessId, query);
}

export async function createPayment(
  session: Session,
  invoiceId: string,
  data: PaymentCreateInput,
): Promise<InvoiceDetail> {
  const persist: PaymentInput = {
    paymentDate: data.paymentDate,
    amount: data.amount,
    method: data.method ?? null,
    notes: data.notes ?? null,
  };

  // Atomic, overpay-safe, businessId-scoped, customerId-derived-from-invoice
  // registration happens entirely inside the repository under
  // `withLock(invoiceId)` (PR1's `lib/mock/payment-repo.ts`) — this service
  // only ever hands it `session.businessId` and the validated payload.
  return repositories.payments.createForInvoice(session.businessId, invoiceId, persist);
}
