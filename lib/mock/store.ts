import { ApiError } from "@/lib/server/api-error";
import type {
  AuditLogEntry,
  Business,
  CatalogItem,
  Customer,
  Employee,
  Expense,
  InventoryMovement,
  Invoice,
  InvoiceItem,
  InvoiceType,
  Payment,
  PayrollPayment,
  Product,
  Role,
} from "@/lib/services/ports";
import {
  expenseCategoryFixtures,
  invoiceTypeFixtures,
  movementTypeFixtures,
  payrollPeriodTypeFixtures,
  paymentMethodFixtures,
} from "./fixtures/catalogs";
import { seedFixtures } from "./fixtures";

/**
 * Links an authenticated user to a business they belong to, with the role
 * they hold there (`docs/database-model.md` "profiles"). A `userId` may now
 * own N profiles — one per business membership.
 */
export type Profile = {
  id: string;
  userId: string;
  businessId: string;
  fullName: string | null;
  email: string;
  role: Role;
  createdAt: string;
  updatedAt: string;
};

export type MockStore = {
  businesses: Map<string, Business>;
  /** Keyed by profile `id` — a single `userId` can own N profiles (one per business membership). */
  profiles: Map<string, Profile>;
  customers: Map<string, Customer>;
  invoices: Map<string, Invoice>;
  invoiceItems: Map<string, InvoiceItem>;
  payments: Map<string, Payment>;
  expenses: Map<string, Expense>;
  employees: Map<string, Employee>;
  payrollPayments: Map<string, PayrollPayment>;
  products: Map<string, Product>;
  inventoryMovements: Map<string, InventoryMovement>;
  auditLogs: Map<string, AuditLogEntry>;
  /** `${businessId}:${invoiceTypeId}` -> last-used sequence number, for atomic per-(business,type) invoice numbering. */
  invoiceSequences: Map<string, number>;
  /**
   * Global, business-agnostic catalogs (Wave 1A) — always seeded (see
   * `createEmptyStore`), never cleared by `clearStore`/`resetStore` (they are
   * reference data, not session/business data), and NOT part of
   * `SerializedStore` (small, static, and re-derivable — no need to bloat the
   * cookie payload). Repos resolve `categoryId`/`methodId`/`typeId`/
   * `periodTypeId`/`invoiceTypeId` from these when a caller doesn't supply
   * one directly (see e.g. `mock/expense-repo.ts#create`).
   */
  invoiceTypes: Map<string, InvoiceType>;
  expenseCategories: Map<string, CatalogItem>;
  paymentMethods: Map<string, CatalogItem>;
  movementTypes: Map<string, CatalogItem>;
  payrollPeriodTypes: Map<string, CatalogItem>;
};

/** JSON-serializable snapshot of a `MockStore`, for cookie-based persistence. */
export type SerializedStore = {
  businesses: Business[];
  profiles: Profile[];
  customers: Customer[];
  invoices: Invoice[];
  invoiceItems: InvoiceItem[];
  payments: Payment[];
  expenses: Expense[];
  employees: Employee[];
  payrollPayments: PayrollPayment[];
  products: Product[];
  inventoryMovements: InventoryMovement[];
  auditLogs: AuditLogEntry[];
  invoiceSequences: Record<string, number>;
};

export function serializeStore(target: MockStore = store): SerializedStore {
  return {
    businesses: [...target.businesses.values()],
    profiles: [...target.profiles.values()],
    customers: [...target.customers.values()],
    invoices: [...target.invoices.values()],
    invoiceItems: [...target.invoiceItems.values()],
    payments: [...target.payments.values()],
    expenses: [...target.expenses.values()],
    employees: [...target.employees.values()],
    payrollPayments: [...target.payrollPayments.values()],
    products: [...target.products.values()],
    inventoryMovements: [...target.inventoryMovements.values()],
    auditLogs: [...target.auditLogs.values()],
    invoiceSequences: Object.fromEntries(target.invoiceSequences),
  };
}

export function clearStore(target: MockStore): void {
  target.businesses.clear();
  target.profiles.clear();
  target.customers.clear();
  target.invoices.clear();
  target.invoiceItems.clear();
  target.payments.clear();
  target.expenses.clear();
  target.employees.clear();
  target.payrollPayments.clear();
  target.products.clear();
  target.inventoryMovements.clear();
  target.auditLogs.clear();
  target.invoiceSequences.clear();
}

/** Repopulates `target` (defaults to the shared singleton) from a snapshot, replacing its current contents. */
export function hydrateStore(data: SerializedStore, target: MockStore = store): void {
  clearStore(target);
  for (const b of data.businesses) target.businesses.set(b.id, b);
  for (const p of data.profiles) target.profiles.set(p.id, p);
  for (const c of data.customers) target.customers.set(c.id, c);
  for (const i of data.invoices) target.invoices.set(i.id, i);
  for (const i of data.invoiceItems) target.invoiceItems.set(i.id, i);
  for (const p of data.payments) target.payments.set(p.id, p);
  // `?? []` is REQUIRED: a cookie serialized before this change has no
  // `expenses` field at all, and this must not throw (design Risk R4).
  for (const e of data.expenses ?? []) target.expenses.set(e.id, e);
  // Same `?? []` requirement for `employees`/`payrollPayments` — a cookie
  // serialized before the nomina-payroll change has neither field at all.
  for (const e of data.employees ?? []) target.employees.set(e.id, e);
  for (const p of data.payrollPayments ?? []) target.payrollPayments.set(p.id, p);
  // Same `?? []` requirement for `products`/`inventoryMovements` — a cookie
  // serialized before the inventario change has neither field at all.
  for (const p of data.products ?? []) target.products.set(p.id, p);
  for (const m of data.inventoryMovements ?? []) target.inventoryMovements.set(m.id, m);
  // Same `?? []` requirement for `auditLogs` — a cookie serialized before the
  // audit-log change has no `auditLogs` field at all.
  for (const a of data.auditLogs ?? []) target.auditLogs.set(a.id, a);
  for (const [k, v] of Object.entries(data.invoiceSequences)) target.invoiceSequences.set(k, v);
}

/**
 * Seeds the global, business-agnostic catalog maps onto `target` — called
 * unconditionally by `createEmptyStore` (see `MockStore.invoiceTypes`'s doc
 * comment for why this must never be skipped, even for a test-only "empty"
 * store).
 */
function seedCatalogs(target: MockStore): void {
  for (const fixture of invoiceTypeFixtures) target.invoiceTypes.set(fixture.id, fixture);
  for (const fixture of expenseCategoryFixtures) target.expenseCategories.set(fixture.id, fixture);
  for (const fixture of paymentMethodFixtures) target.paymentMethods.set(fixture.id, fixture);
  for (const fixture of movementTypeFixtures) target.movementTypes.set(fixture.id, fixture);
  for (const fixture of payrollPeriodTypeFixtures) target.payrollPeriodTypes.set(fixture.id, fixture);
}

export function createEmptyStore(): MockStore {
  const target: MockStore = {
    businesses: new Map(),
    profiles: new Map(),
    customers: new Map(),
    invoices: new Map(),
    invoiceItems: new Map(),
    payments: new Map(),
    expenses: new Map(),
    employees: new Map(),
    payrollPayments: new Map(),
    products: new Map(),
    inventoryMovements: new Map(),
    auditLogs: new Map(),
    invoiceSequences: new Map(),
    invoiceTypes: new Map(),
    expenseCategories: new Map(),
    paymentMethods: new Map(),
    movementTypes: new Map(),
    payrollPeriodTypes: new Map(),
  };
  seedCatalogs(target);
  return target;
}

/** Looks up a catalog entry's `id` by its stable `code`, or `undefined` if no such code is seeded. */
export function findCatalogIdByCode<T extends { id: string; code: string }>(
  catalog: Map<string, T>,
  code: string,
): string | undefined {
  for (const entry of catalog.values()) {
    if (entry.code === code) return entry.id;
  }
  return undefined;
}

/**
 * Resolves a catalog FK for a mutating repo's `create` (expense/payment/
 * inventory-movement/payroll-payment). Defense in depth ONLY: the
 * authoritative clean-400 for a caller-supplied catalog id that doesn't
 * exist comes from the service-layer `assertCatalogId` guard
 * (`lib/services/catalog-service.ts`), which runs BEFORE a mock repo's
 * `create` is ever reached in normal API traffic. This function protects any
 * caller that constructs/calls a mock repo directly (bypassing the service
 * layer entirely — e.g. a test), so a made-up `explicitId` is never silently
 * persisted as a dangling FK even here.
 *
 * When `explicitId` is omitted, falls back to the existing
 * `findCatalogIdByCode` resolution by the enum-validated `code` — unchanged
 * from before.
 */
export function resolveCatalogId<T extends { id: string; code: string }>(
  catalog: Map<string, T>,
  explicitId: string | undefined,
  code: string,
  fieldName: string,
): string {
  if (explicitId) {
    if (!catalog.has(explicitId)) {
      throw new ApiError("VALIDATION_ERROR", `Invalid ${fieldName}: no matching catalog entry.`, {
        field: fieldName,
        id: explicitId,
      });
    }
    return explicitId;
  }
  const resolved = findCatalogIdByCode(catalog, code);
  if (!resolved) {
    throw new Error(`Catalog invariant violated: no entry for code '${code}'.`);
  }
  return resolved;
}

export function generateId(): string {
  return crypto.randomUUID();
}

/**
 * Profiles (memberships) for a single user, ordered by `createdAt` ascending
 * (index 0 = default business at login). Shared by `signIn` and
 * `switchBusiness` (`lib/mock/auth-adapter.ts`) and `listMembershipsForUser`
 * (`lib/mock/business-repo.ts`) so the filter+sort logic lives in exactly
 * one place.
 */
export function listProfilesForUser(store: MockStore, userId: string): Profile[] {
  return [...store.profiles.values()]
    .filter((profile) => profile.userId === userId)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

function simulateLatency(ms = 1): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Resolves the `venta` invoice type's catalog id — the default type for any invoice create that doesn't specify one (Wave 2 will add a type-picking UI). */
export function defaultInvoiceTypeId(store: MockStore): string {
  const id = findCatalogIdByCode(store.invoiceTypes, "venta");
  if (!id) {
    throw new Error("Catalog invariant violated: 'venta' invoice type is not seeded.");
  }
  return id;
}

/** Resolves an invoice type's numbering `prefix` by its catalog id (defaults to "FAC" defensively — should never happen for a seeded catalog). */
function invoiceTypePrefix(store: MockStore, invoiceTypeId: string): string {
  return store.invoiceTypes.get(invoiceTypeId)?.prefix ?? "FAC";
}

/** Composite key for the per-(business, invoice type) sequence counter. */
function invoiceSequenceKey(businessId: string, invoiceTypeId: string): string {
  return `${businessId}:${invoiceTypeId}`;
}

/**
 * Reserves and returns the next sequential invoice number for a business,
 * scoped per invoice type (each type has its OWN sequence and prefix —
 * `invoiceTypeId` defaults to `venta` when omitted, so pre-existing callers
 * that don't pass one keep getting "FAC-XXXX" numbers with unbroken
 * continuity). Synchronous, no artificial delay — used only for fast,
 * deterministic fixture seeding at store creation time.
 */
export function nextInvoiceNumber(store: MockStore, businessId: string, invoiceTypeId?: string): string {
  const typeId = invoiceTypeId ?? defaultInvoiceTypeId(store);
  const key = invoiceSequenceKey(businessId, typeId);
  const current = store.invoiceSequences.get(key) ?? 0;
  const next = current + 1;
  store.invoiceSequences.set(key, next);
  return `${invoiceTypePrefix(store, typeId)}-${String(next).padStart(4, "0")}`;
}

/**
 * Runtime variant of `nextInvoiceNumber` with a deliberate `await` gap
 * between reading and committing the next sequence value — simulating a
 * real DB round-trip (`SELECT ... FOR UPDATE` / RPC). Without this gap, a
 * pure synchronous read-modify-write could never race in single-threaded
 * JS, which would make `withLock(businessId)` untestable and unnecessary
 * for the mock. With the gap, concurrent callers WILL collide unless
 * serialized — which is exactly what `withLock` proves. Callers MUST hold
 * `withLock(businessId)`.
 */
export async function reserveNextInvoiceNumber(
  store: MockStore,
  businessId: string,
  invoiceTypeId?: string,
): Promise<string> {
  const typeId = invoiceTypeId ?? defaultInvoiceTypeId(store);
  const key = invoiceSequenceKey(businessId, typeId);
  const current = store.invoiceSequences.get(key) ?? 0;
  const next = current + 1;
  await simulateLatency();
  store.invoiceSequences.set(key, next);
  return `${invoiceTypePrefix(store, typeId)}-${String(next).padStart(4, "0")}`;
}

function buildSeededStore(): MockStore {
  const fresh = createEmptyStore();
  seedFixtures(fresh);
  return fresh;
}

type GlobalWithMockStore = typeof globalThis & { __mockStore?: MockStore };
const globalWithMockStore = globalThis as GlobalWithMockStore;

/**
 * globalThis-cached singleton so the in-memory store survives Next.js dev
 * HMR — module re-evaluation on every edit-and-save would otherwise silently
 * reset all mock data.
 */
export const store: MockStore =
  globalWithMockStore.__mockStore ?? (globalWithMockStore.__mockStore = buildSeededStore());

/**
 * Test-only helper: re-seeds the shared store IN PLACE.
 *
 * Every mock repo (`productRepo`, `inventoryRepo`, `employeeRepo`, …) is a
 * module-level singleton built once at import time via
 * `createXRepository(store)`, closing over THIS exact object reference. If
 * `resetStore` reassigned `globalWithMockStore.__mockStore` to a brand-new
 * object, those already-constructed repos would keep pointing at the old
 * one and never observe the reset — so tests relying on a pristine store in
 * `beforeEach` would silently leak state across files/describe blocks (only
 * passing by luck of Vitest's default, non-shuffled execution order).
 *
 * Clearing and re-seeding the existing Maps in place mutates the single
 * object every repo already holds, so the reset is observed everywhere
 * without touching how repos are constructed.
 */
export function resetStore(): MockStore {
  clearStore(store);
  seedFixtures(store);
  return store;
}
