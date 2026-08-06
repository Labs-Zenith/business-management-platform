import { ApiError } from "@/lib/server/api-error";
import { computeStatus } from "@/lib/services/status";
import type {
  Customer,
  Invoice,
  InvoiceDetail,
  InvoiceItem,
  InvoiceListQuery,
  InvoicePersist,
  InvoiceVoid,
  InvoiceRepository,
  InvoiceWithFinance,
  InventoryMovement,
  Paged,
  Payment,
  PaymentWithRefs,
} from "@/lib/services/ports";
import { currentQuantityFor } from "./inventory-repo";
import { movementDirectionFor, reverseMovementDirection } from "@/lib/services/inventory-stock";
import { withLock } from "./lock";
import {
  defaultInvoiceTypeId,
  generateId,
  resolveCatalogId,
  reserveNextInvoiceNumber,
  store as defaultStore,
  type MockStore,
} from "./store";
import { invoiceSorter } from "@/lib/services/sorting";

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
/** Mirrors `lib/db/invoice-repo.ts#withFinance` — see its doc comment. */
function withFinance(store: MockStore, invoice: Invoice): InvoiceWithFinance {
  if (invoice.voidedAt) {
    return { ...invoice, paidAmount: 0, balance: 0, status: "voided" };
  }

  const paidAmount = paymentsForInvoice(store, invoice.id)
    .filter((payment) => !payment.voidedAt)
    .reduce((sum, payment) => sum + payment.amount, 0);
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
 * The minimum a movement needs: which product, how many, and enough text to
 * name the offending line if it is rejected.
 */
type MovementEntry = { productId: string | null; quantity: number; description: string };

/** `Stock insuficiente para "X"` — the message a rejected SALE line produces. */
function insufficientStockFor(entry: MovementEntry): string {
  return `Stock insuficiente para "${entry.description}"`;
}

/** Undoing a credit note removes units again, which can underflow if they were re-sold. */
const REVERSE_RETURN_UNDERFLOW =
  "Stock insuficiente para revertir la devolución: esas unidades ya salieron del inventario.";

/**
 * Walks `entries` in order against a RUNNING quantity map and BUILDS the
 * movement rows to persist, WITHOUT touching the store.
 *
 * `direction` decides both the movement type and whether a guard applies: an
 * `out` (a sale's line, or the reversal of a credit note) is checked against
 * the running quantity and throws on the FIRST underflow — mirroring
 * `lib/db/invoice-repo.ts`'s guarded-insert rollback, so this must always be
 * called (and allowed to throw) BEFORE any store mutation. An `in` (a credit
 * note's line, or the reversal of a sale) can never underflow and is never
 * guarded.
 *
 * The running map is what makes two lines of the SAME product in one
 * invoice/edit accumulate correctly, and — for `update` — lets the reversal's
 * effect be visible to the re-apply pass that follows it.
 */
function buildLineMovements(
  store: MockStore,
  businessId: string,
  entries: MovementEntry[],
  runningQty: Map<string, number>,
  now: string,
  direction: "in" | "out",
  describeUnderflow: (entry: MovementEntry) => string,
): InventoryMovement[] {
  const movements: InventoryMovement[] = [];
  for (const entry of entries) {
    if (!entry.productId) continue;
    const productId = entry.productId;
    // PARITY with `lib/db/invoice-repo.ts` (FIX 2): the real DB backend's
    // `inventory_movements.quantity` is an INTEGER column, so a fractional
    // quantity on a product-linked line would surface as a raw Postgres 500
    // there. The mock has no such column constraint, so without this guard a
    // fractional quantity here would silently "succeed" and diverge from the
    // DB backend's behavior — this makes it visible in mock-backed tests too.
    // Free-text "Otro" lines (`productId == null`, skipped above) never touch
    // inventory and may stay fractional.
    if (!Number.isInteger(entry.quantity)) {
      throw new ApiError(
        "VALIDATION_ERROR",
        "La cantidad debe ser un número entero para productos de inventario.",
      );
    }
    if (!runningQty.has(productId)) {
      runningQty.set(productId, currentQuantityFor(store, productId));
    }
    const available = runningQty.get(productId)!;

    if (direction === "out") {
      if (entry.quantity > available) {
        throw new ApiError("VALIDATION_ERROR", describeUnderflow(entry));
      }
      runningQty.set(productId, available - entry.quantity);
    } else {
      // Adding units back can never underflow — no guard, and nothing to
      // reject. Mirrors the unguarded `in` INSERT in the DB twin.
      runningQty.set(productId, available + entry.quantity);
    }

    movements.push({
      id: generateId(),
      businessId,
      productId,
      type: direction,
      typeId: resolveCatalogId(store.movementTypes, undefined, direction, "typeId"),
      quantity: entry.quantity,
      note: null,
      createdAt: now,
    });
  }
  return movements;
}

export function createInvoiceRepository(store: MockStore): InvoiceRepository {
  return {
    async list(businessId: string, query: InvoiceListQuery): Promise<Paged<InvoiceWithFinance>> {
      let invoices = [...store.invoices.values()]
        .filter((invoice) => invoice.businessId === businessId)
        .map((invoice) => withFinance(store, invoice));

      // Voided invoices are hidden unless explicitly asked for — same single
      // exclusion point as the Postgres twin.
      if (query.status !== "voided") {
        invoices = invoices.filter((invoice) => invoice.status !== "voided");
      }

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

      return paginate(invoiceSorter.sort(invoices, query), query.page, query.pageSize);
    },

    /**
     * Mirrors `lib/db/invoice-repo.ts#void`. Everything is validated and the
     * movements are BUILT before a single store write, so a rejected void
     * (already voided, or a stock reversal that cannot be satisfied) leaves
     * the store exactly as it was — the mock equivalent of that method's
     * whole-transaction rollback.
     */
    async void(businessId: string, id: string, data: InvoiceVoid): Promise<InvoiceDetail | null> {
      const existing = store.invoices.get(id);
      if (!existing || existing.businessId !== businessId) {
        return null;
      }
      if (existing.voidedAt) {
        throw new ApiError("CONFLICT", "Esta factura ya está anulada.");
      }

      // Undoing a line moves stock the OPPOSITE way to how it was applied.
      // Only the `out` direction can underflow, so only it is guarded.
      const reversalType = reverseMovementDirection(
        movementDirectionFor(store.invoiceTypes.get(existing.invoiceTypeId)?.code),
      );
      const now = new Date().toISOString();
      const reversalMovements = buildLineMovements(
        store,
        businessId,
        itemsForInvoice(store, id),
        new Map(),
        now,
        reversalType,
        (entry) =>
          `No se puede anular: las unidades devueltas de "${entry.description}" ya salieron del inventario.`,
      );

      // Nothing above touched the store; from here it is all-or-nothing.
      for (const movement of reversalMovements) {
        store.inventoryMovements.set(movement.id, movement);
      }
      for (const [paymentId, payment] of store.payments) {
        if (payment.invoiceId === id && !payment.voidedAt) {
          store.payments.set(paymentId, { ...payment, voidedAt: now, updatedAt: now });
        }
      }
      store.invoices.set(id, {
        ...existing,
        voidedAt: now,
        voidedBy: data.voidedBy,
        voidReason: data.reason,
        updatedAt: now,
      });

      return toInvoiceDetail(store, store.invoices.get(id)!);
    },

    /** Mirrors `lib/db/invoice-repo.ts#listActiveMonths`. */
    async listActiveMonths(businessId: string): Promise<string[]> {
      const months = [...store.invoices.values()]
        .filter((invoice) => invoice.businessId === businessId)
        .map((invoice) => invoice.issueDate.slice(0, 7));
      return [...new Set(months)];
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

        // Validate every product line against stock — and BUILD the
        // movements — BEFORE reserving the invoice number or mutating
        // anything. An overdraw throws here, so it never consumes a
        // sequence number nor persists any partial state (mirrors
        // `lib/db/invoice-repo.ts#create`'s whole-transaction rollback).
        //
        // A credit note is a RETURN: its lines put units back `in` rather
        // than taking them `out`, and so can never overdraw at all.
        const movementType = movementDirectionFor(store.invoiceTypes.get(invoiceTypeId)?.code);
        const movements = buildLineMovements(
          store,
          businessId,
          data.items,
          new Map(),
          now,
          movementType,
          insufficientStockFor,
        );

        const id = generateId();
        const number = await reserveNextInvoiceNumber(store, businessId, invoiceTypeId);

        const items: InvoiceItem[] = data.items.map((item) => ({
          id: generateId(),
          invoiceId: id,
          description: item.description,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          productId: item.productId,
          catalogProductId: item.catalogProductId,
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
          voidedAt: null,
          voidedBy: null,
          voidReason: null,
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
        //
        // The invoice TYPE is immutable after creation, so its direction
        // applies to both the old and the new lines: a sale reverses with
        // `in` then re-applies `out`, a credit note does the mirror image.
        // Whichever side emits `out` is the side that can underflow, and the
        // shared running map is what makes the reversal's effect visible to
        // the re-apply pass that follows it.
        const now = new Date().toISOString();
        const oldItems = itemsForInvoice(store, id);
        const movementType = movementDirectionFor(store.invoiceTypes.get(existing.invoiceTypeId)?.code);
        const reversalType = reverseMovementDirection(movementType);
        const runningQty = new Map<string, number>();
        const reversalMovements = buildLineMovements(
          store,
          businessId,
          oldItems,
          runningQty,
          now,
          reversalType,
          () => REVERSE_RETURN_UNDERFLOW,
        );
        const reapplyMovements = buildLineMovements(
          store,
          businessId,
          data.items,
          runningQty,
          now,
          movementType,
          insufficientStockFor,
        );

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
          catalogProductId: item.catalogProductId,
          lineTotal: item.lineTotal,
        }));
        for (const item of newItems) {
          store.invoiceItems.set(item.id, item);
        }

        // Reversal BEFORE re-apply — matches the running balance built above
        // and the DB implementation's statement order.
        for (const movement of reversalMovements) {
          store.inventoryMovements.set(movement.id, movement);
        }
        for (const movement of reapplyMovements) {
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
