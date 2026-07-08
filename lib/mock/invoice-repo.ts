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
import { generateId, reserveNextInvoiceNumber, store as defaultStore, type MockStore } from "./store";

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
      // Atomic: numbering + invoice + items are all persisted under a single
      // lock holder so concurrent creates for the same business can never
      // observe or produce a duplicate `number`.
      return withLock(businessId, async () => {
        const id = generateId();
        const number = await reserveNextInvoiceNumber(store, businessId);
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
  };
}

export const invoiceRepo: InvoiceRepository = createInvoiceRepository(defaultStore);

// Re-exported for tests that need to assert against raw customer rows.
export type { Customer };
