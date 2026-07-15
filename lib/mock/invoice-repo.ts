import { ApiError } from "@/lib/server/api-error";
import { computeStatus } from "@/lib/services/status";
import type {
  Customer,
  Invoice,
  InvoiceDetail,
  InvoiceItem,
  InvoiceListQuery,
  InvoicePersist,
  InvoiceRepository,
  InvoiceWithFinance,
  Paged,
  Payment,
  PaymentWithRefs,
} from "@/lib/services/ports";
import { withLock } from "./lock";
import { defaultInvoiceTypeId, generateId, reserveNextInvoiceNumber, store as defaultStore, type MockStore } from "./store";

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
        const id = generateId();
        const number = await reserveNextInvoiceNumber(store, businessId, invoiceTypeId);
        const now = new Date().toISOString();

        const items: InvoiceItem[] = data.items.map((item) => ({
          id: generateId(),
          invoiceId: id,
          description: item.description,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
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

        // All-or-nothing insert: header and items are written together,
        // with nothing awaited in between, before releasing the lock.
        store.invoices.set(invoice.id, invoice);
        for (const item of items) {
          store.invoiceItems.set(item.id, item);
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

        // Replace items wholesale: delete all existing items for this
        // invoice, then insert the new set — only after the payment guard
        // above already passed, so a rejected edit never touches items.
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
          lineTotal: item.lineTotal,
        }));
        for (const item of newItems) {
          store.invoiceItems.set(item.id, item);
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
