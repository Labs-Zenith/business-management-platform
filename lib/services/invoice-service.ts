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
import { recordAuditLog } from "@/lib/services/audit-log-service";
import { repositories } from "@/lib/services/repositories";
import { computeStatus } from "@/lib/services/status";
import type {
  InvoiceDetail,
  InvoiceListQuery,
  InvoicePersist,
  InvoiceUpdate,
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

/**
 * Defense in depth: re-validate item invariants even though
 * `lib/schemas/invoice.ts` already enforces them at the HTTP boundary — a
 * caller that reaches this function with invalid items (schema bypassed,
 * forgotten, or a future non-HTTP caller) must still never produce a
 * persisted invoice. Shared by `createInvoice` and `updateInvoice` so both
 * paths reject identically.
 *
 * An empty `items` array is rejected here too: `invoiceCreateSchema` already
 * enforces `.min(1)` at the HTTP boundary for creation, and an edit must not
 * be a backdoor to a zero-item invoice whose totals no longer match any line
 * items. `updateInvoice` has no schema-level `.min(1)` yet (the
 * `invoiceUpdateSchema`/PATCH route is deferred to PR2), so this service-layer
 * check is currently its only guard against an empty edit.
 */
function validateItemInvariants(items: InvoiceItemCreateInput[]): void {
  if (items.length === 0) {
    throw new ApiError("VALIDATION_ERROR", "An invoice must have at least one item.");
  }
  for (const item of items) {
    if (!(item.quantity > 0)) {
      throw new ApiError("VALIDATION_ERROR", "Every item's quantity must be greater than zero.");
    }
    if (!(item.unitPrice >= 0)) {
      throw new ApiError("VALIDATION_ERROR", "Every item's unitPrice cannot be negative.");
    }
  }
}

export async function createInvoice(session: Session, data: InvoiceCreateInput): Promise<InvoiceDetail> {
  const customer = await repositories.customers.getById(session.businessId, data.customerId);
  if (!customer) {
    throw new ApiError("NOT_FOUND", "Customer not found.");
  }

  validateItemInvariants(data.items);

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
  const invoice = await repositories.invoices.create(session.businessId, persist);

  // Best-effort, sequential, AFTER the mutation already committed — see
  // `recordAuditLog`'s SAFETY-CRITICAL doc comment: a failure here never
  // affects the invoice already created and returned below.
  await recordAuditLog(session, "invoice", invoice.id, "invoice_created", invoice.number);

  return invoice;
}

/**
 * Edit-lock gate: `updateInvoice` resolves the invoice via `getInvoice`
 * (`getById` -> `withFinance`/`buildDetail` -> `computeStatus`), reusing the
 * EXACT SAME read-path derivation of `paidAmount` the rest of the app
 * already trusts — no independent re-summing of payments here. Any invoice
 * with `paidAmount !== 0` (including fully paid, `balance === 0`) is
 * rejected with `ApiError("CONFLICT", ...)` BEFORE any repository call, per
 * `openspec/changes/audit-log/specs/invoices/spec.md`'s "Invoice Editing
 * Locked to Zero-Payment Invoices". The repository layer
 * (`InvoiceRepository.update`) re-verifies the SAME invariant atomically as
 * defense in depth — see `openspec/changes/audit-log/design.md`'s "Edit-Lock
 * Race Mechanism" for why both layers are required independently.
 *
 * `number` is NEVER accepted from `data` (the `InvoiceUpdate` type doesn't
 * even have the field) — the repository preserves the existing invoice's
 * `number` untouched.
 */
export async function updateInvoice(session: Session, id: string, data: InvoiceUpdate): Promise<InvoiceDetail> {
  const invoice = await getInvoice(session, id);

  if (invoice.paidAmount !== 0) {
    throw new ApiError("CONFLICT", "Invoice cannot be edited once a payment has been recorded.");
  }

  const customer = await repositories.customers.getById(session.businessId, data.customerId);
  if (!customer) {
    throw new ApiError("NOT_FOUND", "Customer not found.");
  }

  validateItemInvariants(data.items);

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

  const updated = await repositories.invoices.update(session.businessId, id, persist);
  if (!updated) {
    throw new ApiError("NOT_FOUND", "Invoice not found.");
  }

  // Best-effort, sequential, AFTER the mutation already committed — see
  // `recordAuditLog`'s SAFETY-CRITICAL doc comment: a failure here never
  // affects the updated invoice already persisted and returned below.
  await recordAuditLog(session, "invoice", updated.id, "invoice_updated", updated.number);

  return updated;
}
