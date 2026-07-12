import type { Business, Customer, Expense, Invoice, InvoiceItem, Payment, Role } from "@/lib/services/ports";
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
  /** `businessId` -> last-used sequence number, for atomic invoice numbering. */
  invoiceSequences: Map<string, number>;
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
  for (const [k, v] of Object.entries(data.invoiceSequences)) target.invoiceSequences.set(k, v);
}

export function createEmptyStore(): MockStore {
  return {
    businesses: new Map(),
    profiles: new Map(),
    customers: new Map(),
    invoices: new Map(),
    invoiceItems: new Map(),
    payments: new Map(),
    expenses: new Map(),
    invoiceSequences: new Map(),
  };
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

/**
 * Reserves and returns the next sequential invoice number for a business.
 * Synchronous, no artificial delay — used only for fast, deterministic
 * fixture seeding at store creation time.
 */
export function nextInvoiceNumber(store: MockStore, businessId: string): string {
  const current = store.invoiceSequences.get(businessId) ?? 0;
  const next = current + 1;
  store.invoiceSequences.set(businessId, next);
  return `FAC-${String(next).padStart(4, "0")}`;
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
export async function reserveNextInvoiceNumber(store: MockStore, businessId: string): Promise<string> {
  const current = store.invoiceSequences.get(businessId) ?? 0;
  const next = current + 1;
  await simulateLatency();
  store.invoiceSequences.set(businessId, next);
  return `FAC-${String(next).padStart(4, "0")}`;
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

/** Test-only helper: replaces the cached store with a freshly re-seeded one. */
export function resetStore(): MockStore {
  const fresh = buildSeededStore();
  globalWithMockStore.__mockStore = fresh;
  return fresh;
}
