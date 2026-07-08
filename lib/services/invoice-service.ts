/**
 * Invoice service, per
 * `openspec/changes/mocked-mvp-scaffold/specs/invoices/spec.md` and
 * `openspec/changes/mocked-mvp-scaffold/design.md`'s "Invoice creation flow
 * (atomic)".
 *
 * SAFETY-CRITICAL: `createInvoice` NEVER trusts anything from `data` except
 * `customerId`, `issueDate`, `dueDate`, `items[].{description,quantity,
 * unitPrice}`, and `notes` — `business_id` always comes from `session`, and
 * `number`/`status`/`subtotal`/`total`/`line_total` are ALWAYS computed here,
 * never read off the input even if forged directly onto the object
 * (bypassing `lib/schemas/invoice.ts`'s `.strict()` schema). Item invariants
 * (`quantity > 0`, `unitPrice >= 0`) are re-validated here as defense in
 * depth beyond the schema: if ANY item is invalid, the whole creation aborts
 * with `VALIDATION_ERROR` BEFORE `repositories.invoices.create` is ever
 * called — no partial invoice or item is ever persisted (the repository
 * itself is also atomic per PR1's `lib/mock/invoice-repo.ts`, but this
 * service must never even attempt a call with invalid data).
 *
 * `customerId` MUST belong to `session.businessId` — resolved via
 * `repositories.customers.getById(session.businessId, customerId)`, which is
 * always scoped by the session's business, never a client-supplied one.
 * A `null` result (customer missing or belongs to a different business)
 * surfaces as `NOT_FOUND`, matching `customer-service.ts`'s established
 * cross-business convention — the whole creation is rejected, nothing is
 * persisted.
 */

import { lineTotal } from "@/lib/money";
import { ApiError } from "@/lib/server/api-error";
import { repositories } from "@/lib/services/repositories";
import { computeStatus } from "@/lib/services/status";
import type {
  InvoiceDetail,
  InvoiceListQuery,
  InvoicePersist,
  InvoiceWithFinance,
  Paged,
  Session,
} from "@/lib/services/ports";

export type InvoiceItemCreateInput = {
  description: string;
  quantity: number;
  unitPrice: number;
};

export type InvoiceCreateInput = {
  customerId: string;
  issueDate: string;
  dueDate?: string | null;
  items: InvoiceItemCreateInput[];
  notes?: string | null;
};

export async function listInvoices(session: Session, query: InvoiceListQuery): Promise<Paged<InvoiceWithFinance>> {
  return repositories.invoices.list(session.businessId, query);
}

export async function getInvoice(session: Session, id: string): Promise<InvoiceDetail> {
  const invoice = await repositories.invoices.getById(session.businessId, id);
  if (!invoice) {
    throw new ApiError("NOT_FOUND", "Invoice not found.");
  }
  return invoice;
}

export async function createInvoice(session: Session, data: InvoiceCreateInput): Promise<InvoiceDetail> {
  const customer = await repositories.customers.getById(session.businessId, data.customerId);
  if (!customer) {
    throw new ApiError("NOT_FOUND", "Customer not found.");
  }

  // Defense in depth: re-validate item invariants even though
  // `lib/schemas/invoice.ts` already enforces them at the HTTP boundary — a
  // caller that reaches this function with invalid items (schema bypassed,
  // forgotten, or a future non-HTTP caller) must still never produce a
  // persisted invoice.
  for (const item of data.items) {
    if (!(item.quantity > 0)) {
      throw new ApiError("VALIDATION_ERROR", "Every item's quantity must be greater than zero.");
    }
    if (!(item.unitPrice >= 0)) {
      throw new ApiError("VALIDATION_ERROR", "Every item's unitPrice cannot be negative.");
    }
  }

  const items = data.items.map((item) => ({
    description: item.description,
    quantity: item.quantity,
    unitPrice: item.unitPrice,
    lineTotal: lineTotal(item.quantity, item.unitPrice),
  }));

  const subtotal = items.reduce((sum, item) => sum + item.lineTotal, 0);
  const total = subtotal; // No taxes/discounts in the MVP.
  const dueDate = data.dueDate ?? null;
  const status = computeStatus(total, 0, dueDate);

  const persist: InvoicePersist = {
    customerId: data.customerId,
    issueDate: data.issueDate,
    dueDate,
    items,
    subtotal,
    total,
    status,
    notes: data.notes ?? null,
  };

  // Atomic per-business numbering + invoice+items insertion happens inside
  // the repository under `withLock(businessId)` (PR1's
  // `lib/mock/invoice-repo.ts`) — this service only ever hands it
  // server-computed data.
  return repositories.invoices.create(session.businessId, persist);
}
