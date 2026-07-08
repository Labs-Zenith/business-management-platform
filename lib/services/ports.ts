/**
 * Ports-and-adapters seam (see `openspec/changes/mocked-mvp-scaffold/design.md`).
 *
 * UI and services depend ONLY on the types/interfaces defined in this file.
 * Nothing outside `lib/mock/**` and `lib/services/repositories.ts` may import
 * the mock implementations directly. Swapping to real Supabase later means
 * rewriting `lib/mock/*` and `repositories.ts` only.
 *
 * All monetary amounts are integer minor units (COP cents).
 */

import type { InvoiceStatus } from "./status";

export type Session = {
  userId: string;
  businessId: string;
  email: string;
};

export interface AuthPort {
  getSession(): Promise<Session | null>;
  signIn(email: string, password: string): Promise<Session | null>;
  signOut(): Promise<void>;
}

export type Paged<T> = {
  data: T[];
  page: number;
  pageSize: number;
  total: number;
};

// ---------------------------------------------------------------------------
// Business
// ---------------------------------------------------------------------------

export type Business = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  currency: string;
  createdAt: string;
  updatedAt: string;
};

export interface BusinessRepository {
  getById(businessId: string): Promise<Business | null>;
}

// ---------------------------------------------------------------------------
// Customers
// ---------------------------------------------------------------------------

export type Customer = {
  id: string;
  businessId: string;
  name: string;
  documentNumber: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  notes: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type CustomerWithBalance = Customer & { balance: number };

export type CustomerDetail = Customer & {
  totalInvoiced: number;
  totalPaid: number;
  balance: number;
  recentInvoices: InvoiceWithFinance[];
  recentPayments: PaymentWithRefs[];
};

export type CustomerListQuery = {
  q?: string;
  status?: "active" | "inactive";
  page: number;
  pageSize: number;
};

export type CustomerCreate = {
  name: string;
  documentNumber?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  notes?: string | null;
};

export type CustomerUpdate = Partial<CustomerCreate> & { isActive?: boolean };

export interface CustomerRepository {
  list(businessId: string, query: CustomerListQuery): Promise<Paged<CustomerWithBalance>>;
  getById(businessId: string, id: string): Promise<CustomerDetail | null>;
  create(businessId: string, data: CustomerCreate): Promise<Customer>;
  update(businessId: string, id: string, data: CustomerUpdate): Promise<Customer | null>;
}

// ---------------------------------------------------------------------------
// Invoices
// ---------------------------------------------------------------------------

export type InvoiceItemInput = {
  description: string;
  quantity: number;
  unitPrice: number;
};

export type InvoiceItem = InvoiceItemInput & {
  id: string;
  invoiceId: string;
  lineTotal: number;
};

/** Server-computed payload the service layer hands to the repository. */
export type InvoicePersist = {
  customerId: string;
  issueDate: string;
  dueDate: string | null;
  items: Array<InvoiceItemInput & { lineTotal: number }>;
  subtotal: number;
  total: number;
  status: InvoiceStatus;
  notes: string | null;
};

export type Invoice = {
  id: string;
  businessId: string;
  customerId: string;
  number: string;
  issueDate: string;
  dueDate: string | null;
  subtotal: number;
  total: number;
  status: InvoiceStatus;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

export type InvoiceWithFinance = Invoice & {
  paidAmount: number;
  balance: number;
};

export type InvoiceDetail = InvoiceWithFinance & {
  customer: Customer;
  items: InvoiceItem[];
  payments: PaymentWithRefs[];
};

export type InvoiceListQuery = {
  customerId?: string;
  status?: InvoiceStatus;
  from?: string;
  to?: string;
  page: number;
  pageSize: number;
};

export interface InvoiceRepository {
  list(businessId: string, query: InvoiceListQuery): Promise<Paged<InvoiceWithFinance>>;
  getById(businessId: string, id: string): Promise<InvoiceDetail | null>;
  /** Atomic: generates the per-business `number` and persists invoice+items together. */
  create(businessId: string, data: InvoicePersist): Promise<InvoiceDetail>;
}

// ---------------------------------------------------------------------------
// Payments
// ---------------------------------------------------------------------------

export type PaymentInput = {
  paymentDate: string;
  amount: number;
  method?: string | null;
  notes?: string | null;
};

export type Payment = {
  id: string;
  businessId: string;
  invoiceId: string;
  customerId: string;
  paymentDate: string;
  amount: number;
  method: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PaymentWithRefs = Payment & {
  customer: Pick<Customer, "id" | "name">;
  invoice: Pick<Invoice, "id" | "number">;
};

export type PaymentListQuery = {
  customerId?: string;
  invoiceId?: string;
  from?: string;
  to?: string;
  page: number;
  pageSize: number;
};

export interface PaymentRepository {
  list(businessId: string, query: PaymentListQuery): Promise<Paged<PaymentWithRefs>>;
  /**
   * Locked, overpay-rejecting, atomic: reads current balance, rejects
   * `amount > balance`, derives `customerId` from the invoice (never from
   * `data`), inserts the payment, and recomputes/persists invoice status —
   * all under `withLock(invoiceId)`.
   */
  createForInvoice(businessId: string, invoiceId: string, data: PaymentInput): Promise<InvoiceDetail>;
}
