import type { Business, BusinessMembership, BusinessRepository, BusinessUpdate } from "@/lib/services/ports";
import { store as defaultStore, listProfilesForUser, type MockStore } from "./store";

/**
 * Artificial async gap simulating a real DB round-trip, matching the pattern
 * already used by `payment-repo.ts`/`store.ts`. Without it, this read would
 * resolve fully synchronously and `app/(dashboard)/settings/loading.tsx`'s
 * skeleton would never actually be demonstrable, even though it's still the
 * correct Suspense boundary to have.
 */
function simulateLatency(ms = 1): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function createBusinessRepository(store: MockStore): BusinessRepository {
  return {
    async getById(businessId: string): Promise<Business | null> {
      await simulateLatency();
      return store.businesses.get(businessId) ?? null;
    },

    async listMembershipsForUser(userId: string): Promise<BusinessMembership[]> {
      await simulateLatency();
      const memberships: BusinessMembership[] = [];
      for (const profile of listProfilesForUser(store, userId)) {
        const business = store.businesses.get(profile.businessId);
        // Orphaned membership (businessId doesn't resolve to a real
        // business record) — skip it entirely rather than surfacing a
        // fabricated `businessName: ""` row.
        if (!business) {
          continue;
        }
        memberships.push({ businessId: profile.businessId, businessName: business.name, role: profile.role });
      }
      return memberships;
    },

    async update(businessId: string, data: BusinessUpdate): Promise<Business | null> {
      await simulateLatency();
      const existing = store.businesses.get(businessId);
      if (!existing) {
        return null;
      }

      const updated: Business = {
        ...existing,
        ...data,
        updatedAt: new Date().toISOString(),
      };
      store.businesses.set(businessId, updated);
      return updated;
    },
  };
}

export const businessRepo: BusinessRepository = createBusinessRepository(defaultStore);
