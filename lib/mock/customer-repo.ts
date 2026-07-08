import { computeStatus } from "@/lib/services/status";
import type {
  Customer,
  CustomerCreate,
  CustomerDetail,
  CustomerListQuery,
  CustomerRepository,
  CustomerUpdate,
  CustomerWithBalance,
  Invoice,
  InvoiceWithFinance,
  Paged,
  Payment,
  PaymentWithRefs,
} from "@/lib/services/ports";
import { generateId, store as defaultStore, type MockStore } from "./store";

function invoicesForCustomer(store: MockStore, customerId: string): Invoice[] {
  return [...store.invoices.values()].filter((invoice) => invoice.customerId === customerId);
}

function paymentsForCustomer(store: MockStore, customerId: string): Payment[] {
  return [...store.payments.values()].filter((payment) => payment.customerId === customerId);
}

function paymentsForInvoice(store: MockStore, invoiceId: string): Payment[] {
  return [...store.payments.values()].filter((payment) => payment.invoiceId === invoiceId);
}

function withFinance(store: MockStore, invoice: Invoice): InvoiceWithFinance {
  const paidAmount = paymentsForInvoice(store, invoice.id).reduce((sum, payment) => sum + payment.amount, 0);
  const balance = invoice.total - paidAmount;
  const status = computeStatus(invoice.total, paidAmount, invoice.dueDate, new Date());
  return { ...invoice, paidAmount, balance, status };
}

function toPaymentWithRefs(store: MockStore, customer: Customer, payment: Payment): PaymentWithRefs {
  const invoice = store.invoices.get(payment.invoiceId);
  return {
    ...payment,
    customer: { id: customer.id, name: customer.name },
    invoice: { id: payment.invoiceId, number: invoice?.number ?? "" },
  };
}

function computeCustomerBalance(store: MockStore, customerId: string): number {
  const totalInvoiced = invoicesForCustomer(store, customerId).reduce((sum, invoice) => sum + invoice.total, 0);
  const totalPaid = paymentsForCustomer(store, customerId).reduce((sum, payment) => sum + payment.amount, 0);
  return totalInvoiced - totalPaid;
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

export function createCustomerRepository(store: MockStore): CustomerRepository {
  return {
    async list(businessId: string, query: CustomerListQuery): Promise<Paged<CustomerWithBalance>> {
      let customers = [...store.customers.values()].filter((customer) => customer.businessId === businessId);

      if (query.status) {
        const wantActive = query.status === "active";
        customers = customers.filter((customer) => customer.isActive === wantActive);
      }
      if (query.q) {
        const needle = query.q.trim().toLowerCase();
        customers = customers.filter((customer) =>
          [customer.name, customer.documentNumber, customer.email, customer.phone].some((field) =>
            field?.toLowerCase().includes(needle),
          ),
        );
      }

      customers.sort((a, b) => a.name.localeCompare(b.name));

      const withBalance: CustomerWithBalance[] = customers.map((customer) => ({
        ...customer,
        balance: computeCustomerBalance(store, customer.id),
      }));

      return paginate(withBalance, query.page, query.pageSize);
    },

    async getById(businessId: string, id: string): Promise<CustomerDetail | null> {
      const customer = store.customers.get(id);
      if (!customer || customer.businessId !== businessId) {
        return null;
      }

      const invoicesWithFinance = invoicesForCustomer(store, id).map((invoice) => withFinance(store, invoice));
      const payments = paymentsForCustomer(store, id);

      const totalInvoiced = invoicesWithFinance.reduce((sum, invoice) => sum + invoice.total, 0);
      const totalPaid = payments.reduce((sum, payment) => sum + payment.amount, 0);

      const recentInvoices = [...invoicesWithFinance]
        .sort((a, b) => (a.issueDate < b.issueDate ? 1 : -1))
        .slice(0, 5);

      const recentPayments = [...payments]
        .sort((a, b) => (a.paymentDate < b.paymentDate ? 1 : -1))
        .slice(0, 5)
        .map((payment) => toPaymentWithRefs(store, customer, payment));

      return {
        ...customer,
        totalInvoiced,
        totalPaid,
        balance: totalInvoiced - totalPaid,
        recentInvoices,
        recentPayments,
      };
    },

    async create(businessId: string, data: CustomerCreate): Promise<Customer> {
      const now = new Date().toISOString();
      const customer: Customer = {
        id: generateId(),
        businessId,
        name: data.name,
        documentNumber: data.documentNumber ?? null,
        email: data.email ?? null,
        phone: data.phone ?? null,
        address: data.address ?? null,
        notes: data.notes ?? null,
        isActive: true,
        createdAt: now,
        updatedAt: now,
      };
      store.customers.set(customer.id, customer);
      return customer;
    },

    async update(businessId: string, id: string, data: CustomerUpdate): Promise<Customer | null> {
      const existing = store.customers.get(id);
      if (!existing || existing.businessId !== businessId) {
        return null;
      }

      const updated: Customer = {
        ...existing,
        ...data,
        updatedAt: new Date().toISOString(),
      };
      store.customers.set(id, updated);
      return updated;
    },
  };
}

export const customerRepo: CustomerRepository = createCustomerRepository(defaultStore);
