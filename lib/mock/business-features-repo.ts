import type { BusinessFeatureRepository, Feature } from "@/lib/services/ports";
import { store as defaultStore, type MockStore } from "./store";

/**
 * In-memory mirror of the Postgres `business_features` table (see
 * `lib/db/business-features-repo.ts`). Deny-by-default: a business with no
 * entry in `store.businessFeatures`, or a feature explicitly set to
 * `enabled: false`, both resolve to disabled — matching the DB repo's
 * "no row -> false" contract.
 */
export function createBusinessFeatureRepository(store: MockStore): BusinessFeatureRepository {
  return {
    async isEnabled(businessId: string, feature: Feature): Promise<boolean> {
      return store.businessFeatures.get(businessId)?.get(feature) ?? false;
    },

    async listEnabledFeatures(businessId: string): Promise<Feature[]> {
      const featureMap = store.businessFeatures.get(businessId);
      if (!featureMap) return [];
      return [...featureMap.entries()].filter(([, enabled]) => enabled).map(([feature]) => feature);
    },

    async setEnabled(businessId: string, feature: Feature, enabled: boolean): Promise<void> {
      let featureMap = store.businessFeatures.get(businessId);
      if (!featureMap) {
        featureMap = new Map();
        store.businessFeatures.set(businessId, featureMap);
      }
      featureMap.set(feature, enabled);
    },
  };
}

export const businessFeatureRepo: BusinessFeatureRepository = createBusinessFeatureRepository(defaultStore);
