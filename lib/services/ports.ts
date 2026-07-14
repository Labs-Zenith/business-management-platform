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

export type BusinessUpdate = {
  name?: string;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  currency?: string;
};

export interface BusinessRepository {
  getById(businessId: string): Promise<Business | null>;
  /** Memberships for a user, ordered by profile `created_at` ASC (index 0 = default business). */
  listMembershipsForUser(userId: string): Promise<BusinessMembership[]>;
  /** Scoped by `businessId`; returns `null` if missing (never leaked, matches `CustomerRepository.update`). */
  update(businessId: string, data: BusinessUpdate): Promise<Business | null>;
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

/**
 * Service-facing edit input (mirrors `InvoiceCreateInput`'s shape exactly).
 * `number` is deliberately excluded — it is immutable and never accepted on
 * edit, matching `openspec/changes/audit-log/design.md`'s "Interfaces /
 * Contracts" section.
 */
export type InvoiceUpdate = {
  customerId: string;
  issueDate: string;
  dueDate?: string | null;
  items: InvoiceItemInput[];
  notes?: string | null;
};

export interface InvoiceRepository {
  list(businessId: string, query: InvoiceListQuery): Promise<Paged<InvoiceWithFinance>>;
  getById(businessId: string, id: string): Promise<InvoiceDetail | null>;
  /** Atomic: generates the per-business `number` and persists invoice+items together. */
  create(businessId: string, data: InvoicePersist): Promise<InvoiceDetail>;
  /**
   * Edit-lock defense in depth (see
   * `openspec/changes/audit-log/design.md`'s "Edit-Lock Race Mechanism"):
   * atomically re-verifies zero-payments before persisting, regardless of
   * what the service layer already checked. Returns `null` if `id` is
   * missing or belongs to a different business (never leaked, matching
   * `getById`'s convention). Throws `ApiError("CONFLICT", ...)` if the
   * invoice has any payment recorded — zero mutation on rejection. `number`
   * is never accepted here; the existing invoice's `number` is preserved
   * untouched. Items are replaced wholesale (delete + re-insert).
   */
  update(businessId: string, id: string, data: InvoicePersist): Promise<InvoiceDetail | null>;
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

// ---------------------------------------------------------------------------
// Expenses
// ---------------------------------------------------------------------------

export type ExpenseCategory = "nomina" | "otro";

/**
 * Repository-facing create payload. Unlike invoices, NOTHING here is
 * server-derived (no number/status/balance), so this doubles as the
 * service's persist type — `businessId` is always a separate argument,
 * never a field, matching Payment's `PaymentInput`.
 */
export type ExpenseInput = {
  category: ExpenseCategory;
  expenseDate: string;
  description: string;
  amount: number;
  notes?: string | null;
};

export type Expense = {
  id: string;
  businessId: string;
  category: ExpenseCategory;
  expenseDate: string;
  description: string;
  amount: number;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ExpenseListQuery = {
  category?: ExpenseCategory;
  from?: string;
  to?: string;
  page: number;
  pageSize: number;
};

export interface ExpenseRepository {
  list(businessId: string, query: ExpenseListQuery): Promise<Paged<Expense>>;
  /** Scoped by `businessId`; cross-business or missing -> `null`, never leaked (matches PaymentRepository.getById). */
  getById(businessId: string, id: string): Promise<Expense | null>;
  /** Plain insert — no lock, no sequence, no balance invariant. */
  create(businessId: string, data: ExpenseInput): Promise<Expense>;
}

// ---------------------------------------------------------------------------
// Employees (editable — Customer-style)
// ---------------------------------------------------------------------------

export type Employee = {
  id: string;
  businessId: string;
  name: string;
  baseSalary: number;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

export type EmployeeCreate = {
  name: string;
  baseSalary: number;
};

export type EmployeeUpdate = Partial<EmployeeCreate> & { active?: boolean };

export type EmployeeListQuery = {
  q?: string;
  status?: "active" | "inactive";
  page: number;
  pageSize: number;
};

export interface EmployeeRepository {
  list(businessId: string, query: EmployeeListQuery): Promise<Paged<Employee>>;
  getById(businessId: string, id: string): Promise<Employee | null>;
  create(businessId: string, data: EmployeeCreate): Promise<Employee>;
  update(businessId: string, id: string, data: EmployeeUpdate): Promise<Employee | null>;
}

// ---------------------------------------------------------------------------
// Payroll payments (append-only — Payment/Expense-style)
// ---------------------------------------------------------------------------

export type PeriodType = "quincenal" | "mensual";

/** Caller-facing input: the caller picks periodType + a reference date; period_start/period_end are server-derived. */
export type PayrollPaymentInput = {
  employeeId: string;
  amount: number;
  periodType: PeriodType;
  referenceDate: string;
  paymentDate: string;
  notes?: string | null;
};

/** Server-computed payload the service layer hands to the repository (period already derived). */
export type PayrollPaymentPersist = {
  employeeId: string;
  amount: number;
  periodType: PeriodType;
  periodStart: string;
  periodEnd: string;
  paymentDate: string;
  notes: string | null;
};

export type PayrollPayment = {
  id: string;
  businessId: string;
  employeeId: string;
  amount: number;
  periodType: PeriodType;
  periodStart: string;
  periodEnd: string;
  paymentDate: string;
  notes: string | null;
  createdAt: string;
};

export type PayrollPaymentWithEmployee = PayrollPayment & { employee: Pick<Employee, "id" | "name"> };

export type PayrollPaymentListQuery = {
  employeeId?: string;
  from?: string;
  to?: string;
  page: number;
  pageSize: number;
};

export interface PayrollPaymentRepository {
  list(businessId: string, query: PayrollPaymentListQuery): Promise<Paged<PayrollPaymentWithEmployee>>;
  getById(businessId: string, id: string): Promise<PayrollPaymentWithEmployee | null>;
  /** Atomic: inserts the payroll payment AND its `category:'nomina'` expense in ONE transaction. */
  create(businessId: string, data: PayrollPaymentPersist, expense: ExpenseInput): Promise<PayrollPayment>;
}

// ---------------------------------------------------------------------------
// Products (editable — Employee-style) & Inventory Movements (append-only)
// ---------------------------------------------------------------------------

/**
 * `products` stores NO quantity/value column — `currentQuantity`/
 * `totalValue`/`isLowStock` are always derived at read time by the repo layer
 * (`ProductWithStock`) from the `inventory_movements` ledger, structurally
 * identical to how `invoice-repo.ts#withFinance` derives `balance`/`status`
 * from `payments`. `unitCost` is an integer minor unit (COP cents).
 */
export type Product = {
  id: string;
  businessId: string;
  name: string;
  sku: string | null;
  unitCost: number;
  minStockThreshold: number;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

/** Computed view returned by `list`/`getById` — never persisted. */
export type ProductWithStock = Product & {
  currentQuantity: number;
  totalValue: number;
  isLowStock: boolean;
};

export type ProductCreate = {
  name: string;
  sku?: string | null;
  unitCost: number;
  minStockThreshold?: number;
};

export type ProductUpdate = Partial<ProductCreate> & { active?: boolean };

export type ProductListQuery = {
  q?: string;
  status?: "active" | "inactive";
  page: number;
  pageSize: number;
};

export interface ProductRepository {
  list(businessId: string, query: ProductListQuery): Promise<Paged<ProductWithStock>>;
  getById(businessId: string, id: string): Promise<ProductWithStock | null>;
  create(businessId: string, data: ProductCreate): Promise<Product>;
  update(businessId: string, id: string, data: ProductUpdate): Promise<Product | null>;
}

// ---------------------------------------------------------------------------
// Audit Log (append-only — Expense-style)
// ---------------------------------------------------------------------------

/**
 * Append-only, business-scoped audit trail row, per
 * `openspec/changes/audit-log/specs/audit-logging/spec.md`. `entityType` and
 * `action` are deliberately free TEXT (no CHECK constraint / union type) so
 * new instrumented events don't require a schema/type change — see
 * `openspec/changes/audit-log/design.md`'s "Architecture Decisions".
 * `entityType` is `"invoice"` for every row this phase produces (payments
 * included), so the panel query stays `WHERE entity_type='invoice' AND
 * entity_id=:invoiceId`.
 */
export type AuditLogEntry = {
  id: string;
  businessId: string;
  entityType: string;
  entityId: string;
  action: string;
  actorUserId: string;
  detail: string | null;
  createdAt: string;
};

/**
 * Repository-facing create payload. Append-only (Expense-style):
 * `businessId` is always a separate argument, never a field.
 */
export type AuditLogCreate = {
  entityType: string;
  entityId: string;
  action: string;
  actorUserId: string;
  detail?: string | null;
};

export interface AuditLogRepository {
  /** Business-scoped, filtered by `entityType`/`entityId`, ordered `createdAt` DESC. */
  list(businessId: string, entityType: string, entityId: string): Promise<AuditLogEntry[]>;
  /** Plain insert — no lock, no sequence, no balance invariant. No update/delete surface (append-only). */
  create(businessId: string, data: AuditLogCreate): Promise<AuditLogEntry>;
}

export type MovementType = "in" | "out";

/**
 * Repository-facing create payload. Append-only (Payment/Expense-style):
 * `businessId` is always a separate argument, never a field.
 */
export type InventoryMovementCreate = {
  productId: string;
  type: MovementType;
  quantity: number;
  note?: string | null;
};

export type InventoryMovement = {
  id: string;
  businessId: string;
  productId: string;
  type: MovementType;
  quantity: number;
  note: string | null;
  createdAt: string;
};

export type InventoryMovementWithProduct = InventoryMovement & {
  product: Pick<Product, "id" | "name">;
};

export type InventoryMovementListQuery = {
  productId?: string;
  type?: MovementType;
  from?: string;
  to?: string;
  page: number;
  pageSize: number;
};

export interface InventoryMovementRepository {
  list(businessId: string, query: InventoryMovementListQuery): Promise<Paged<InventoryMovementWithProduct>>;
  getById(businessId: string, id: string): Promise<InventoryMovementWithProduct | null>;
  /**
   * Atomic, floor-at-zero: rejects an `out` movement that would drive the
   * product's computed quantity below zero with ZERO mutation — mirroring
   * `PaymentRepository.createForInvoice`'s overpay-rejection pattern (locked
   * read-check-write in mock; single guarded CTE in Postgres).
   */
  create(businessId: string, data: InventoryMovementCreate): Promise<InventoryMovement>;
}
