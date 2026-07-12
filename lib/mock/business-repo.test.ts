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
    expect(memberships[1]?.role).toBe("admin");
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
