import { describe, expect, it } from "vitest";
import type { Business } from "@/lib/services/ports";
import { createEmptyStore, hydrateStore, serializeStore, type Profile, type SerializedStore } from "./store";

/**
 * Regression test for design Risk R4: a cookie serialized BEFORE the
 * `expenses` field existed has no `expenses` key at all on the parsed JSON
 * object. `hydrateStore` MUST NOT throw on that payload — the `?? []`
 * fallback in `hydrateStore` is what makes this safe.
 */

const BUSINESS_ID = "10000000-0000-4000-8000-000000000001";
const PROFILE_ID = "30000000-0000-4000-8000-000000000001";

function buildLegacyPayload(): Omit<SerializedStore, "expenses"> {
  const business: Business = {
    id: BUSINESS_ID,
    name: "Negocio Legacy",
    email: null,
    phone: null,
    address: null,
    currency: "COP",
    createdAt: "2024-01-01T00:00:00.000Z",
    updatedAt: "2024-01-01T00:00:00.000Z",
  };
  const profile: Profile = {
    id: PROFILE_ID,
    userId: "20000000-0000-4000-8000-000000000001",
    businessId: BUSINESS_ID,
    fullName: "Usuario Legacy",
    email: "legacy@negociodemo.test",
    role: "admin",
    createdAt: "2024-01-01T00:00:00.000Z",
    updatedAt: "2024-01-01T00:00:00.000Z",
  };
  return {
    businesses: [business],
    profiles: [profile],
    customers: [],
    invoices: [],
    invoiceItems: [],
    payments: [],
    invoiceSequences: {},
  };
}

describe("hydrateStore — backward compatibility with pre-expenses cookies (R4)", () => {
  it("does not throw when the payload is missing the expenses field entirely", () => {
    const legacyPayload = buildLegacyPayload() as SerializedStore; // simulates JSON.parse of an old cookie: no `expenses` key
    const target = createEmptyStore();

    expect(() => hydrateStore(legacyPayload, target)).not.toThrow();
  });

  it("hydrates the rest of the store correctly even though expenses is absent, leaving expenses empty", () => {
    const legacyPayload = buildLegacyPayload() as SerializedStore;
    const target = createEmptyStore();

    hydrateStore(legacyPayload, target);

    expect(target.businesses.get(BUSINESS_ID)).toBeDefined();
    expect(target.profiles.get(PROFILE_ID)).toBeDefined();
    expect(target.expenses.size).toBe(0);
  });

  it("still hydrates expenses normally when the field IS present (current-format cookie)", () => {
    const target = createEmptyStore();
    target.expenses.set("60000000-0000-4000-8000-000000000001", {
      id: "60000000-0000-4000-8000-000000000001",
      businessId: BUSINESS_ID,
      category: "otro",
      expenseDate: "2026-07-01",
      description: "Gasto de prueba",
      amount: 10000,
      notes: null,
      createdAt: "2026-07-01T00:00:00.000Z",
      updatedAt: "2026-07-01T00:00:00.000Z",
    });
    const snapshot = serializeStore(target);

    const rehydrated = createEmptyStore();
    hydrateStore(snapshot, rehydrated);

    expect(rehydrated.expenses.size).toBe(1);
    expect(rehydrated.expenses.get("60000000-0000-4000-8000-000000000001")?.description).toBe("Gasto de prueba");
  });
});
