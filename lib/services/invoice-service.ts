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

import { formatCOP, lineTotal } from "@/lib/money";
import { ApiError } from "@/lib/server/api-error";
import { assertCatalogId } from "@/lib/services/catalog-service";
import { recordAuditLog } from "@/lib/services/audit-log-service";
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

/**
 * Resolves the invoice type for a create: when the caller supplies an
 * explicit `invoiceTypeId`, it is validated to actually EXIST in the catalog
 * — via `assertCatalogId` — before it is ever forwarded to
 * `repositories.invoices.create`, so a well-formed but nonexistent id fails
 * here with a clean `VALIDATION_ERROR` instead of reaching the mock (silent
 * dangling FK) or the DB backend (raw FK-violation 500). Otherwise it
 * defaults to the `venta` catalog type (no type-picking UI wires an explicit
 * choice yet — Wave 2). The repository ALSO defaults this internally (see
 * `InvoiceRepository.create`'s doc comment) as a second line of defense for
 * any other/future caller, but this service resolves it explicitly so the
 * audit-logged/returned invoice's `invoiceTypeId` reflects the SAME
 * resolution this function reasoned about.
 */
async function resolveInvoiceTypeId(invoiceTypeId?: string): Promise<string> {
  const types = await repositories.catalog.listInvoiceTypes();
  if (invoiceTypeId) {
    assertCatalogId(types, invoiceTypeId, "invoiceTypeId");
    return invoiceTypeId;
  }
  const venta = types.find((type) => type.code === "venta");
  if (!venta) {
    throw new Error("Catalog invariant violated: 'venta' invoice type is not seeded.");
  }
  return venta.id;
}

export type InvoiceItemCreateInput = {
  description: string;
  quantity: number;
  unitPrice: number;
  /**
   * Optional FK to `products.id` — when present, the repository decrements
   * that product's stock via a guarded `out` inventory movement in the SAME
   * transaction as the invoice write (see `InvoiceRepository.create`/
   * `.update`'s doc comments). Omitted/`null` for a free-text "Otro" line,
   * which never touches inventory. No HTTP schema wires this field yet
   * (`lib/schemas/invoice.ts` is unchanged) — this is the service-layer seam
   * for a future caller/UI wave; defaults to `null` when absent so the
   * current schema-validated route keeps working unchanged.
   */
  productId?: string | null;
};

export type InvoiceCreateInput = {
  customerId: string;
  issueDate: string;
  dueDate?: string | null;
  items: InvoiceItemCreateInput[];
  notes?: string | null;
  /** Optional FK to `invoice_types.id` — see `resolveInvoiceTypeId`'s doc comment. */
  invoiceTypeId?: string;
};

/**
 * Service-facing edit input — deliberately its OWN type (mirroring
 * `InvoiceCreateInput`'s shape, minus `invoiceTypeId`), NOT `ports.ts`'s
 * `InvoiceUpdate` directly. `InvoiceUpdate.items` is `InvoiceItemInput[]`,
 * whose `productId` is a REQUIRED `string | null` (the repository-layer
 * contract) — but `lib/schemas/invoice.ts`'s `invoiceUpdateSchema` (the only
 * caller today, via `app/api/invoices/[id]/route.ts`) has no `productId`
 * field yet, so its parsed payload cannot satisfy that repository-facing
 * type. Using this looser, service-local type (via `InvoiceItemCreateInput`,
 * whose `productId` is optional) keeps the current schema-validated route
 * type-checking unchanged, while still letting any future/direct caller pass
 * `productId` through to the repository below (defaulted to `null` per item,
 * same as `createInvoice`).
 */
export type InvoiceUpdateInput = {
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
    productId: item.productId ?? null,
    lineTotal: lineTotal(item.quantity, item.unitPrice),
  }));

  const subtotal = items.reduce((sum, item) => sum + item.lineTotal, 0);
  const total = subtotal; // No taxes/discounts in the MVP.
  const dueDate = data.dueDate ?? null;
  const status = computeStatus(total, 0, dueDate);
  const invoiceTypeId = await resolveInvoiceTypeId(data.invoiceTypeId);

  const persist: InvoicePersist = {
    customerId: data.customerId,
    issueDate: data.issueDate,
    dueDate,
    items,
    subtotal,
    total,
    status,
    notes: data.notes ?? null,
    invoiceTypeId,
  };

  // Atomic per-(business, invoice type) numbering + invoice+items insertion
  // happens inside the repository, all in ONE transaction (real Postgres:
  // `runTransaction` in `lib/db/invoice-repo.ts#create`; mock:
  // `withLock(`${businessId}:${invoiceTypeId}`)` in
  // `lib/mock/invoice-repo.ts#create`) — this service only ever hands it
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
 * EXACT SAME read-path derivation of `paidAmount`/`balance` the rest of the
 * app already trusts — no independent re-summing of payments here.
 *
 * An invoice is editable while it is NOT fully paid (`balance > 0`); once
 * fully paid (`balance <= 0`), it is rejected with `ApiError("CONFLICT",
 * ...)` BEFORE any repository call, per
 * `openspec/changes/invoice-edit-partial/specs/invoices/spec.md`'s "Invoice
 * Editing Locked to Fully-Paid Invoices". Additionally, once the new `total`
 * is computed from the submitted items, an edit whose new total would drop
 * BELOW the amount already paid (`total < invoice.paidAmount`) is rejected
 * with `ApiError("VALIDATION_ERROR", ...)` — this preserves the
 * overpay-safety invariant that an invoice's total never shrinks below money
 * already collected against it. The repository layer
 * (`InvoiceRepository.update`) re-verifies BOTH conditions atomically as
 * defense in depth — see `openspec/changes/audit-log/design.md`'s "Edit-Lock
 * Race Mechanism" for why both layers are required independently.
 *
 * `number` is NEVER accepted from `data` (the `InvoiceUpdate` type doesn't
 * even have the field) — the repository preserves the existing invoice's
 * `number` untouched.
 */
export async function updateInvoice(session: Session, id: string, data: InvoiceUpdateInput): Promise<InvoiceDetail> {
  const invoice = await getInvoice(session, id);

  // Fully-paid invoices are permanently locked.
  if (invoice.balance <= 0) {
    throw new ApiError("CONFLICT", "Invoice cannot be edited once it is fully paid.");
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
    productId: item.productId ?? null,
    lineTotal: lineTotal(item.quantity, item.unitPrice),
  }));

  const subtotal = items.reduce((sum, item) => sum + item.lineTotal, 0);
  const total = subtotal; // No taxes/discounts in the MVP.
  const dueDate = data.dueDate ?? null;

  // The edit must never reduce the total below what has already been
  // collected — this preserves the same overpay-safety invariant the payment
  // side enforces from the other direction.
  if (invoice.paidAmount > 0 && total < invoice.paidAmount) {
    throw new ApiError("VALIDATION_ERROR", "The invoice total cannot be reduced below the amount already paid.");
  }

  // Note: `invoice.paidAmount` was read at the top of this function (via
  // `getInvoice`); if a payment commits concurrently between that read and
  // this point, the `status` persisted below can be momentarily stale. This
  // is harmless and accepted, pre-existing behavior: the persisted `status`
  // column is NEVER trusted for logic anywhere in this codebase — every read
  // path (`getById`/`list`, both via `withFinance`) recomputes `status` from
  // live payments at read time, exactly like recording a payment
  // (`payment-service.ts#createPayment`) never updates the invoice's `status`
  // column either. The column is a denormalized cache for convenience only.
  const status = computeStatus(total, invoice.paidAmount, dueDate);

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
  const detail = `Total: ${formatCOP(invoice.total)} → ${formatCOP(updated.total)}`;
  await recordAuditLog(session, "invoice", updated.id, "invoice_updated", detail);

  return updated;
}
