import { ApiError } from "@/lib/server/api-error";
import { computeStatus } from "@/lib/services/status";
import type {
  Customer,
  Invoice,
  InvoiceDetail,
  InvoiceItem,
  InvoiceListQuery,
  InvoiceItemInput,
  InvoicePersist,
  InvoiceRepository,
  InvoiceWithFinance,
  InventoryMovement,
  Paged,
  Payment,
  PaymentWithRefs,
} from "@/lib/services/ports";
import { currentQuantityFor } from "./inventory-repo";
import { withLock } from "./lock";
import {
  defaultInvoiceTypeId,
  generateId,
  resolveCatalogId,
  reserveNextInvoiceNumber,
  store as defaultStore,
  type MockStore,
} from "./store";

function paymentsForInvoice(store: MockStore, invoiceId: string): Payment[] {
  return [...store.payments.values()].filter((payment) => payment.invoiceId === invoiceId);
}

function itemsForInvoice(store: MockStore, invoiceId: string): InvoiceItem[] {
  return [...store.invoiceItems.values()].filter((item) => item.invoiceId === invoiceId);
}

function toPaymentWithRefs(store: MockStore, payment: Payment): PaymentWithRefs {
  const customer = store.customers.get(payment.customerId);
  const invoice = store.invoices.get(payment.invoiceId);
  return {
    ...payment,
    customer: { id: payment.customerId, name: customer?.name ?? "" },
    invoice: { id: payment.invoiceId, number: invoice?.number ?? "" },
  };
}

/** Recomputes paid/balance/status for an invoice from the current payments. */
function withFinance(store: MockStore, invoice: Invoice): InvoiceWithFinance {
  const paidAmount = paymentsForInvoice(store, invoice.id).reduce((sum, payment) => sum + payment.amount, 0);
  const balance = invoice.total - paidAmount;
  const status = computeStatus(invoice.total, paidAmount, invoice.dueDate, new Date());
  return { ...invoice, paidAmount, balance, status };
}

function toInvoiceDetail(store: MockStore, invoice: Invoice): InvoiceDetail {
  const withFinanceData = withFinance(store, invoice);
  const customer = store.customers.get(invoice.customerId);
  if (!customer) {
    throw new Error(`Invoice ${invoice.id} references a missing customer ${invoice.customerId}`);
  }
  const items = itemsForInvoice(store, invoice.id);
  const payments = paymentsForInvoice(store, invoice.id).map((payment) => toPaymentWithRefs(store, payment));
  return { ...withFinanceData, customer, items, payments };
}

function paginate<T>(items: T[], page: number, pageSize: number): Paged<T> {
  const start = (page - 1) * pageSize;
  return {
    data: items.slice(start, start + pageSize),
    page,
    pageSize,
    total: items.length,
  };
}

/**
 * Validates every product-linked item against a RUNNING per-product
 * quantity (so two lines of the SAME product in one invoice/edit accumulate
 * correctly, and — for `update` — reversed old quantities are already
 * folded in by the caller before this runs) and BUILDS the `out` movement
 * rows to persist, WITHOUT touching the store. Throws `VALIDATION_ERROR`
 * (naming the offending line) on the FIRST overdraw — mirrors
 * `lib/db/invoice-repo.ts`'s guarded-insert rollback: this function must
 * always be called (and allowed to throw) BEFORE any store mutation, so a
 * rejected create/edit never partially decrements stock. `runningQty` is
 * lazily seeded from `currentQuantityFor` for a product not already present
 * (a fresh `Map` for `create`; pre-seeded with reversed quantities for
 * `update` — see `seedRunningQtyWithReversal`). A free-text "Otro" line
 * (`item.productId == null`) is skipped entirely — it never touches
 * inventory.
 */
function buildOutMovements(
  store: MockStore,
  businessId: string,
  items: InvoiceItemInput[],
  runningQty: Map<string, number>,
  now: string,
): InventoryMovement[] {
  const movements: InventoryMovement[] = [];
  for (const item of items) {
    if (!item.productId) continue;
    const productId = item.productId;
    // PARITY with `lib/db/invoice-repo.ts` (FIX 2): the real DB backend's
    // `inventory_movements.quantity` is an INTEGER column, so a fractional
    // quantity on a product-linked line would surface as a raw Postgres 500
    // there. The mock has no such column constraint, so without this guard a
    // fractional quantity here would silently "succeed" and diverge from the
    // DB backend's behavior — this makes it visible in mock-backed tests too.
    // Free-text "Otro" lines (`item.productId == null`, skipped above) never
    // touch inventory and may stay fractional.
    if (!Number.isInteger(item.quantity)) {
      throw new ApiError(
        "VALIDATION_ERROR",
        "La cantidad debe ser un número entero para productos de inventario.",
      );
    }
    if (!runningQty.has(productId)) {
      runningQty.set(productId, currentQuantityFor(store, productId));
    }
    const available = runningQty.get(productId)!;
    if (item.quantity > available) {
      throw new ApiError("VALIDATION_ERROR", `Stock insuficiente para "${item.description}"`);
    }
    runningQty.set(productId, available - item.quantity);
    movements.push({
      id: generateId(),
      businessId,
      productId,
      type: "out",
      typeId: resolveCatalogId(store.movementTypes, undefined, "out", "typeId"),
      quantity: item.quantity,
      note: null,
      createdAt: now,
    });
  }
  return movements;
}

/**
 * Builds the reversal `in` movements for every OLD product-linked item of an
 * edited invoice — restores exactly the quantity each pre-edit line had
 * reserved. Never throws (restoring stock can never drive it below zero).
 */
function buildInMovements(store: MockStore, businessId: string, oldItems: InvoiceItem[], now: string): InventoryMovement[] {
  return oldItems
    .filter((item): item is InvoiceItem & { productId: string } => item.productId !== null)
    .map((item) => ({
      id: generateId(),
      businessId,
      productId: item.productId,
      type: "in",
      typeId: resolveCatalogId(store.movementTypes, undefined, "in", "typeId"),
      quantity: item.quantity,
      note: null,
      createdAt: now,
    }));
}

/**
 * Seeds a running-quantity map for `update`'s `buildOutMovements` call: every
 * OLD product line's quantity is added BACK (restored) before the NEW lines
 * are validated/decremented against it — so an edit that keeps the SAME
 * product/quantity (or reduces it) never spuriously overdraws against its
 * own pre-edit reservation.
 */
function seedRunningQtyWithReversal(store: MockStore, oldItems: InvoiceItem[]): Map<string, number> {
  const runningQty = new Map<string, number>();
  for (const old of oldItems) {
    if (!old.productId) continue;
    if (!runningQty.has(old.productId)) {
      runningQty.set(old.productId, currentQuantityFor(store, old.productId));
    }
    runningQty.set(old.productId, runningQty.get(old.productId)! + old.quantity);
  }
  return runningQty;
}

export function createInvoiceRepository(store: MockStore): InvoiceRepository {
  return {
    async list(businessId: string, query: InvoiceListQuery): Promise<Paged<InvoiceWithFinance>> {
      let invoices = [...store.invoices.values()]
        .filter((invoice) => invoice.businessId === businessId)
        .map((invoice) => withFinance(store, invoice));

      if (query.customerId) {
        invoices = invoices.filter((invoice) => invoice.customerId === query.customerId);
      }
      if (query.status) {
        invoices = invoices.filter((invoice) => invoice.status === query.status);
      }
      if (query.from) {
        invoices = invoices.filter((invoice) => invoice.issueDate >= query.from!);
      }
      if (query.to) {
        invoices = invoices.filter((invoice) => invoice.issueDate <= query.to!);
      }

      invoices.sort((a, b) => (a.issueDate < b.issueDate ? 1 : -1));

      return paginate(invoices, query.page, query.pageSize);
    },

    async getById(businessId: string, id: string): Promise<InvoiceDetail | null> {
      const invoice = store.invoices.get(id);
      if (!invoice || invoice.businessId !== businessId) {
        return null;
      }
      return toInvoiceDetail(store, invoice);
    },

    async create(businessId: string, data: InvoicePersist): Promise<InvoiceDetail> {
      // `invoiceTypeId` defaults to the `venta` catalog type when the caller
      // doesn't supply one (no type-picking UI wires it yet — Wave 2; see
      // `invoice-service.ts#createInvoice`, which is the one caller today and
      // always resolves this before calling `create`). Numbering is scoped
      // per (business, type) — see `store.ts#nextInvoiceNumber`'s doc
      // comment — so the lock key must include the type too, or two
      // different types' concurrent creates for the SAME business would
      // needlessly serialize against each other (harmless for correctness,
      // but two independent per-type sequences don't need a shared lock).
      //
      // An explicitly-supplied `invoiceTypeId` is verified to actually exist
      // in the catalog first — defense in depth for any direct caller that
      // bypasses `invoice-service.ts#createInvoice`'s own `assertCatalogId`
      // guard (mirrors `resolveCatalogId`'s doc comment in `store.ts`).
      if (data.invoiceTypeId && !store.invoiceTypes.has(data.invoiceTypeId)) {
        throw new ApiError("VALIDATION_ERROR", "Invalid invoiceTypeId: no matching catalog entry.", {
          field: "invoiceTypeId",
          id: data.invoiceTypeId,
        });
      }
      const invoiceTypeId = data.invoiceTypeId ?? defaultInvoiceTypeId(store);
      return withLock(`${businessId}:${invoiceTypeId}`, async () => {
        const now = new Date().toISOString();

        // Validate every product line against stock — and BUILD the `out`
        // movements — BEFORE reserving the invoice number or mutating
        // anything. An overdraw throws here, so it never consumes a
        // sequence number nor persists any partial state (mirrors
        // `lib/db/invoice-repo.ts#create`'s whole-transaction rollback).
        const movements = buildOutMovements(store, businessId, data.items, new Map(), now);

        const id = generateId();
        const number = await reserveNextInvoiceNumber(store, businessId, invoiceTypeId);

        const items: InvoiceItem[] = data.items.map((item) => ({
          id: generateId(),
          invoiceId: id,
          description: item.description,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          productId: item.productId,
          lineTotal: item.lineTotal,
        }));

        const invoice: Invoice = {
          id,
          businessId,
          customerId: data.customerId,
          invoiceTypeId,
          number,
          issueDate: data.issueDate,
          dueDate: data.dueDate,
          subtotal: data.subtotal,
          total: data.total,
          status: data.status,
          notes: data.notes,
          createdAt: now,
          updatedAt: now,
        };

        // All-or-nothing insert: header, items, and inventory movements are
        // written together, with nothing awaited in between, before
        // releasing the lock.
        store.invoices.set(invoice.id, invoice);
        for (const item of items) {
          store.invoiceItems.set(item.id, item);
        }
        for (const movement of movements) {
          store.inventoryMovements.set(movement.id, movement);
        }

        return toInvoiceDetail(store, invoice);
      });
    },

    async update(businessId: string, id: string, data: InvoicePersist): Promise<InvoiceDetail | null> {
      // Same lock key `payment-repo.ts#createForInvoice` uses for this
      // invoice — both writers serialize on the SAME in-process mutex, which
      // is what makes the read-check-write sequence below atomic against a
      // concurrent payment registration (see
      // `openspec/changes/audit-log/design.md`'s "Edit-Lock Race Mechanism").
      // Guard predicate (`invoice-edit-partial`): editable while NOT fully
      // paid (`existing.total - paidAmount > 0`); additionally, the
      // submitted new `data.total` must never drop below `paidAmount` (money
      // already collected can never be un-collected by an edit).
      return withLock(id, async () => {
        const existing = store.invoices.get(id);
        if (!existing || existing.businessId !== businessId) {
          // Cross-business or missing: `null`, never leaked — matches
          // `getById`'s convention; the service maps this to `NOT_FOUND`.
          return null;
        }

        // Defense in depth: re-verify the not-fully-paid + new-total-not-
        // below-paid invariant here too, even though `updateInvoice` (service)
        // already checked — never trust that the service layer is the only
        // caller. This is the atomic race-only fallback (a payment landing
        // concurrently between the service's check and this lock), so BOTH
        // branches below throw `CONFLICT` — a concurrent payment is a
        // conflict at this layer, even for the branch that mirrors what the
        // service layer would otherwise reject as `VALIDATION_ERROR`. The two
        // messages are kept distinct for operator debuggability, but the
        // error CODE is intentionally the same `CONFLICT` for both, matching
        // the db-backed repository's single ANDed guard (which cannot
        // distinguish the two causes at all).
        const paidAmount = paymentsForInvoice(store, id).reduce((sum, p) => sum + p.amount, 0);
        if (existing.total - paidAmount <= 0) {
          throw new ApiError("CONFLICT", "Invoice cannot be edited once it is fully paid.");
        }
        if (data.total < paidAmount) {
          throw new ApiError("CONFLICT", "The invoice total cannot be reduced below the amount already paid.");
        }

        // Inventory reversal/decrement — validated and BUILT before any
        // store mutation, mirroring `lib/db/invoice-repo.ts#update`'s
        // whole-transaction rollback: an overdraw on a NEW product line
        // throws here, before the old items are deleted or anything else is
        // touched, so a rejected edit never partially reverses/decrements
        // stock. Old product lines are captured NOW (before the wholesale
        // delete below) and their quantities are restored into the running
        // balance first, so a line kept on the SAME product (or reduced)
        // never spuriously overdraws against its own pre-edit reservation.
        const now = new Date().toISOString();
        const oldItems = itemsForInvoice(store, id);
        const runningQty = seedRunningQtyWithReversal(store, oldItems);
        const outMovements = buildOutMovements(store, businessId, data.items, runningQty, now);
        const inMovements = buildInMovements(store, businessId, oldItems, now);

        // Replace items wholesale: delete all existing items for this
        // invoice, then insert the new set — only after the payment guard
        // AND the stock guard above already passed, so a rejected edit never
        // touches items or inventory.
        for (const [itemId, item] of store.invoiceItems) {
          if (item.invoiceId === id) {
            store.invoiceItems.delete(itemId);
          }
        }
        const newItems: InvoiceItem[] = data.items.map((item) => ({
          id: generateId(),
          invoiceId: id,
          description: item.description,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          productId: item.productId,
          lineTotal: item.lineTotal,
        }));
        for (const item of newItems) {
          store.invoiceItems.set(item.id, item);
        }

        // Reversal (`in`) BEFORE decrement (`out`) — matches
        // `buildOutMovements`'s seeded running balance and the DB
        // implementation's statement order.
        for (const movement of inMovements) {
          store.inventoryMovements.set(movement.id, movement);
        }
        for (const movement of outMovements) {
          store.inventoryMovements.set(movement.id, movement);
        }

        const updated: Invoice = {
          ...existing,
          // `number` is deliberately NOT overwritten — immutable, per
          // `InvoiceUpdate`'s contract.
          customerId: data.customerId,
          issueDate: data.issueDate,
          dueDate: data.dueDate,
          subtotal: data.subtotal,
          total: data.total,
          status: data.status,
          notes: data.notes,
          updatedAt: new Date().toISOString(),
        };
        store.invoices.set(id, updated);

        return toInvoiceDetail(store, updated);
      });
    },
  };
}

export const invoiceRepo: InvoiceRepository = createInvoiceRepository(defaultStore);

// Re-exported for tests that need to assert against raw customer rows.
export type { Customer };
