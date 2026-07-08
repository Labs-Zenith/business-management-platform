import type { Business, BusinessRepository } from "@/lib/services/ports";
import { store as defaultStore, type MockStore } from "./store";

export function createBusinessRepository(store: MockStore): BusinessRepository {
  return {
    async getById(businessId: string): Promise<Business | null> {
      return store.businesses.get(businessId) ?? null;
    },
  };
}

export const businessRepo: BusinessRepository = createBusinessRepository(defaultStore);
