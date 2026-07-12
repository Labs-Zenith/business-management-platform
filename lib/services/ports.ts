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

export type Role = "admin" | "worker";

export type Session = {
  userId: string;
  businessId: string;
  email: string;
  role: Role;
};

export interface AuthPort {
  getSession(): Promise<Session | null>;
  signIn(email: string, password: string): Promise<Session | null>;
  signOut(): Promise<void>;
  /**
   * Re-issues the session cookie for the already-authenticated user, active
   * business swapped to `businessId` with the given `role`.
   *
   * SECURITY CONTRACT: this method performs NO membership verification of
   * its own and blindly trusts the caller — `role` MUST be sourced from a
   * prior `BusinessRepository.listMembershipsForUser(userId)` lookup against
   * the currently-active backend (real Postgres or mock, whichever is
   * wired). The only sanctioned caller is
   * `app/api/auth/switch-business/route.ts`. Do NOT call this with a
   * client-supplied or otherwise unverified `role` — doing so is a
   * privilege-escalation vector. Returns `null` (current session untouched,
   * no cookie re-issued) only if there is no prior session.
   *
   * `AuthPort` (and `switchBusiness` specifically) has exactly ONE
   * implementation regardless of backend — see `lib/services/repositories.ts`'s
   * wiring comment for why `auth: authAdapter` is unconditional and
   * backend-agnostic.
   */
  switchBusiness(businessId: string, role: Role): Promise<Session | null>;
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

export type BusinessMembership = {
  businessId: string;
  businessName: string;
  role: Role;
};

export interface BusinessRepository {
  getById(businessId: string): Promise<Business | null>;
  /** Memberships for a user, ordered by profile `created_at` ASC (index 0 = default business). */
  listMembershipsForUser(userId: string): Promise<BusinessMembership[]>;
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
  /** Scoped by `businessId`; returns `null` if missing or belongs to another business (cross-business -> `null`, never leaked). */
  getById(businessId: string, id: string): Promise<PaymentWithRefs | null>;
  /**
   * Locked, overpay-rejecting, atomic: reads current balance, rejects
   * `amount > balance`, derives `customerId` from the invoice (never from
   * `data`), inserts the payment, and recomputes/persists invoice status —
   * all under `withLock(invoiceId)`.
   */
  createForInvoice(businessId: string, invoiceId: string, data: PaymentInput): Promise<InvoiceDetail>;
}
