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
 *
 * `methodId` (optional FK to `payment_methods.id`) is validated to actually
 * EXIST in the catalog — via `assertCatalogId` — before it is ever forwarded
 * to `repositories.payments.createForInvoice`, so a well-formed but
 * nonexistent id fails here with a clean `VALIDATION_ERROR` instead of
 * reaching the mock (silent dangling FK) or the DB backend (raw
 * FK-violation 500). When omitted, the repository still resolves it from
 * `method`'s code, exactly as before.
 */

import { formatCOP } from "@/lib/money";
import { ApiError } from "@/lib/server/api-error";
import { assertCatalogId } from "@/lib/services/catalog-service";
import { recordAuditLog } from "@/lib/services/audit-log-service";
import { repositories } from "@/lib/services/repositories";
import type { InvoiceDetail, Paged, PaymentInput, PaymentListQuery, PaymentWithRefs, Session } from "@/lib/services/ports";

export type PaymentCreateInput = {
  paymentDate: string;
  amount: number;
  method?: string | null;
  notes?: string | null;
  /** Optional FK to `payment_methods.id` — see this file's module doc comment. */
  methodId?: string;
};

export async function listPayments(session: Session, query: PaymentListQuery): Promise<Paged<PaymentWithRefs>> {
  return repositories.payments.list(session.businessId, query);
}

/**
 * Single-record lookup scoped to `session.businessId`, used by the print
 * payment receipt (`app/(print)/payments/[id]/receipt/page.tsx`, PR8) — a
 * cross-business or missing payment id surfaces as `NOT_FOUND`, matching
 * `invoice-service.ts#getInvoice`'s established convention (never a leaked
 * record from another business).
 */
export async function getPayment(session: Session, id: string): Promise<PaymentWithRefs> {
  const payment = await repositories.payments.getById(session.businessId, id);
  if (!payment) {
    throw new ApiError("NOT_FOUND", "Payment not found.");
  }
  return payment;
}

export async function createPayment(
  session: Session,
  invoiceId: string,
  data: PaymentCreateInput,
): Promise<InvoiceDetail> {
  if (data.methodId) {
    const methods = await repositories.catalog.listPaymentMethods();
    assertCatalogId(methods, data.methodId, "methodId");
  }

  const persist: PaymentInput = {
    paymentDate: data.paymentDate,
    amount: data.amount,
    method: data.method ?? null,
    methodId: data.methodId ?? null,
    notes: data.notes ?? null,
  };

  // Atomic, overpay-safe, businessId-scoped, customerId-derived-from-invoice
  // registration happens entirely inside the repository under
  // `withLock(invoiceId)` (PR1's `lib/mock/payment-repo.ts`) — this service
  // only ever hands it `session.businessId` and the validated payload.
  const detail = await repositories.payments.createForInvoice(session.businessId, invoiceId, persist);

  // Best-effort, sequential, AFTER the mutation already committed — see
  // `recordAuditLog`'s SAFETY-CRITICAL doc comment: a failure here never
  // affects the payment already recorded and the invoice detail returned
  // below. `entityType` stays `"invoice"` (not `"payment"`) per
  // `openspec/changes/audit-log/design.md` — the MovementsPanel queries by
  // invoice, not by payment.
  await recordAuditLog(session, "invoice", invoiceId, "payment_recorded", `Monto: ${formatCOP(persist.amount)}`);

  return detail;
}
