import type { Business, Customer, Invoice, InvoiceItem, Payment } from "@/lib/services/ports";
import { seedFixtures } from "./fixtures";

/**
 * Links an authenticated user to the single business they belong to
 * (`docs/database-model.md` "profiles"). MVP rule: one user, one business.
 */
export type Profile = {
  id: string;
  userId: string;
  businessId: string;
  fullName: string | null;
  email: string;
  createdAt: string;
  updatedAt: string;
};

export type MockStore = {
  businesses: Map<string, Business>;
  /** Keyed by `userId`. */
  profiles: Map<string, Profile>;
  customers: Map<string, Customer>;
  invoices: Map<string, Invoice>;
  invoiceItems: Map<string, InvoiceItem>;
  payments: Map<string, Payment>;
  /** `businessId` -> last-used sequence number, for atomic invoice numbering. */
  invoiceSequences: Map<string, number>;
};

export function createEmptyStore(): MockStore {
  return {
    businesses: new Map(),
    profiles: new Map(),
    customers: new Map(),
    invoices: new Map(),
    invoiceItems: new Map(),
    payments: new Map(),
    invoiceSequences: new Map(),
  };
}

export function generateId(): string {
  return crypto.randomUUID();
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
