import { ApiError } from "@/lib/server/api-error";
import type {
  InvoiceDetail,
  Payment,
  PaymentInput,
  PaymentListQuery,
  PaymentRepository,
  PaymentWithRefs,
  Paged,
} from "@/lib/services/ports";
import { computeStatus } from "@/lib/services/status";
import { withLock } from "./lock";
import { generateId, store as defaultStore, type MockStore } from "./store";

function paymentsForInvoice(store: MockStore, invoiceId: string): Payment[] {
  return [...store.payments.values()].filter((payment) => payment.invoiceId === invoiceId);
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
 * Artificial async gap simulating a real DB round-trip between reading the
 * current balance and committing the new payment. Without it, a pure
 * synchronous read-check-write could never race in single-threaded JS,
 * which would make `withLock(invoiceId)` untestable and unnecessary here.
 */
function simulateLatency(ms = 1): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Lazily resolved to avoid a circular import with invoice-repo.ts, which
// also depends on this repository's store shape only, not its exports.
function requireInvoice(store: MockStore, businessId: string, invoiceId: string) {
  const invoice = store.invoices.get(invoiceId);
  if (!invoice || invoice.businessId !== businessId) {
    throw new ApiError("NOT_FOUND", "Invoice not found");
  }
  return invoice;
}

function toInvoiceDetail(store: MockStore, invoiceId: string): InvoiceDetail {
  const invoice = store.invoices.get(invoiceId);
  if (!invoice) {
    throw new ApiError("NOT_FOUND", "Invoice not found");
  }
  const customer = store.customers.get(invoice.customerId);
  if (!customer) {
    throw new Error(`Invoice ${invoice.id} references a missing customer ${invoice.customerId}`);
  }
  const items = [...store.invoiceItems.values()].filter((item) => item.invoiceId === invoice.id);
  const payments = paymentsForInvoice(store, invoice.id).map((payment) => toPaymentWithRefs(store, payment));
  const paidAmount = payments.reduce((sum, payment) => sum + payment.amount, 0);
  const balance = invoice.total - paidAmount;
  const status = computeStatus(invoice.total, paidAmount, invoice.dueDate, new Date());
  return { ...invoice, paidAmount, balance, status, customer, items, payments };
}

export function createPaymentRepository(store: MockStore): PaymentRepository {
  return {
    async getById(businessId: string, id: string): Promise<PaymentWithRefs | null> {
      const payment = store.payments.get(id);
      if (!payment || payment.businessId !== businessId) {
        // Cross-business or missing: `null`, never leaked to the caller —
        // matches `invoiceRepo.getById`/`customerRepo.getById`'s convention
        // (PR4/PR5), which callers map to `NOT_FOUND` at the service layer.
        return null;
      }
      return toPaymentWithRefs(store, payment);
    },

    async list(businessId: string, query: PaymentListQuery): Promise<Paged<PaymentWithRefs>> {
      let payments = [...store.payments.values()]
        .filter((payment) => payment.businessId === businessId)
        .map((payment) => toPaymentWithRefs(store, payment));

      if (query.customerId) {
        payments = payments.filter((payment) => payment.customerId === query.customerId);
      }
      if (query.invoiceId) {
        payments = payments.filter((payment) => payment.invoiceId === query.invoiceId);
      }
      if (query.from) {
        payments = payments.filter((payment) => payment.paymentDate >= query.from!);
      }
      if (query.to) {
        payments = payments.filter((payment) => payment.paymentDate <= query.to!);
      }

      payments.sort((a, b) => (a.paymentDate < b.paymentDate ? 1 : -1));

      return paginate(payments, query.page, query.pageSize);
    },

    async createForInvoice(businessId: string, invoiceId: string, data: PaymentInput): Promise<InvoiceDetail> {
      // Atomic, overpay-safe: read-check-write happens entirely inside one
      // lock holder (`withLock(invoiceId)`), so a concurrent second request
      // can never read a stale pre-insert balance.
      return withLock(invoiceId, async () => {
        const invoice = requireInvoice(store, businessId, invoiceId);

        const paidSoFar = paymentsForInvoice(store, invoice.id).reduce((sum, payment) => sum + payment.amount, 0);
        const balance = invoice.total - paidSoFar;

        // Real async gap between reading the balance and committing the
        // payment — this is what makes the lock a genuine correctness
        // requirement rather than a no-op.
        await simulateLatency();

        if (data.amount > balance) {
          // No mutation, no partial apply: reject before any write.
          throw new ApiError("VALIDATION_ERROR", "Payment amount exceeds the invoice's pending balance");
        }

        const now = new Date().toISOString();
        const payment: Payment = {
          id: generateId(),
          businessId,
          invoiceId: invoice.id,
          // Derived from the invoice — NEVER accepted from a client-controlled source.
          customerId: invoice.customerId,
          paymentDate: data.paymentDate,
          amount: data.amount,
          method: data.method ?? null,
          notes: data.notes ?? null,
          createdAt: now,
          updatedAt: now,
        };
        store.payments.set(payment.id, payment);

        const newPaid = paidSoFar + payment.amount;
        const newStatus = computeStatus(invoice.total, newPaid, invoice.dueDate, new Date());
        store.invoices.set(invoice.id, { ...invoice, status: newStatus, updatedAt: now });

        return toInvoiceDetail(store, invoice.id);
      });
    },
  };
}

export const paymentRepo: PaymentRepository = createPaymentRepository(defaultStore);
