import type { Business, BusinessRepository } from "@/lib/services/ports";
import { store as defaultStore, type MockStore } from "./store";

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
  };
}

export const businessRepo: BusinessRepository = createBusinessRepository(defaultStore);
