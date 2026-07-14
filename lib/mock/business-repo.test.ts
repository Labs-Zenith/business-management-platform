import { beforeEach, describe, expect, it } from "vitest";
import { businessRepo } from "./business-repo";
import { generateId, resetStore, store } from "./store";
import { BUSINESS_ID, BUSINESS_ID_2, DEMO_USER_ID } from "./fixtures/data";

describe("businessRepo.listMembershipsForUser", () => {
  beforeEach(() => {
    resetStore();
  });

  it("returns both seeded memberships for the demo user, ordered by createdAt ASC", async () => {
    const memberships = await businessRepo.listMembershipsForUser(DEMO_USER_ID);

    expect(memberships).toHaveLength(2);
    expect(memberships[0]?.businessId).toBe(BUSINESS_ID);
    expect(memberships[0]?.businessName).toBe("Negocio Demo");
    expect(memberships[0]?.role).toBe("admin");
    expect(memberships[1]?.businessId).toBe(BUSINESS_ID_2);
    expect(memberships[1]?.businessName).toBe("Negocio Demo 2");
    expect(memberships[1]?.role).toBe("worker");
  });

  it("returns an empty array for a user with no memberships", async () => {
    const memberships = await businessRepo.listMembershipsForUser("00000000-0000-4000-8000-000000000000");
    expect(memberships).toEqual([]);
  });

  it("skips an orphaned membership (businessId with no matching business record) instead of returning a fabricated businessName: ''", async () => {
    const now = new Date().toISOString();
    const orphanProfileId = generateId();
    store.profiles.set(orphanProfileId, {
      id: orphanProfileId,
      userId: DEMO_USER_ID,
      businessId: "10000000-0000-4000-8000-00000000dead", // no matching businesses row
      fullName: "Usuario Demo",
      email: "demo@negociodemo.test",
      role: "admin",
      createdAt: now,
      updatedAt: now,
    });

    const memberships = await businessRepo.listMembershipsForUser(DEMO_USER_ID);

    // Still returns the 2 real seeded memberships; the orphaned one is
    // skipped entirely rather than appearing with businessName: "".
    expect(memberships).toHaveLength(2);
    expect(memberships.some((m) => m.businessName === "")).toBe(false);
  });
});

describe("businessRepo.update", () => {
  beforeEach(() => {
    resetStore();
  });

  it("applies a partial descriptive update and bumps updatedAt", async () => {
    const before = store.businesses.get(BUSINESS_ID);
    const previousUpdatedAt = before?.updatedAt;

    const updated = await businessRepo.update(BUSINESS_ID, { name: "Negocio Renombrado", phone: "3001234567" });

    expect(updated).not.toBeNull();
    expect(updated?.name).toBe("Negocio Renombrado");
    expect(updated?.phone).toBe("3001234567");
    // Unrelated fields are preserved.
    expect(updated?.email).toBe(before?.email);
    expect(updated?.address).toBe(before?.address);
    expect(updated?.currency).toBe(before?.currency);
    expect(updated?.updatedAt).not.toBe(previousUpdatedAt);
  });

  it("applies a currency-only update", async () => {
    const updated = await businessRepo.update(BUSINESS_ID, { currency: "USD" });

    expect(updated?.currency).toBe("USD");
    expect(store.businesses.get(BUSINESS_ID)?.currency).toBe("USD");
  });

  it("returns null for an id with no matching business record (never throws, never fabricates)", async () => {
    const updated = await businessRepo.update("10000000-0000-4000-8000-00000000dead", { name: "No existe" });

    expect(updated).toBeNull();
  });
});
