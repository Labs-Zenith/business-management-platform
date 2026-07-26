import { repositories } from "./repositories";
import type { Feature } from "./ports";

/**
 * Per-BUSINESS feature flags, DB-backed via the `business_features` table
 * (see `migrations/1700000015000_add_business_features.sql` and
 * `lib/services/ports.ts`'s `BusinessFeatureRepository`). Distinct from role
 * capabilities (`lib/services/permissions.ts`): a capability gates by the
 * member's ROLE within a business, whereas a feature here is enabled for a
 * set of BUSINESSES regardless of role.
 *
 * Enabling a module for a business is now a row in `business_features`, not
 * a redeploy — this replaces the earlier `PIPELINE_ENABLED_BUSINESS_IDS` env
 * var. Deny-by-default: a business with no row (or `enabled = false`) has
 * the feature disabled, matching the env var's "empty allowlist = disabled
 * for everyone" contract.
 */

/** True if `feature` is enabled for `businessId`. */
export function isFeatureEnabled(businessId: string, feature: Feature): Promise<boolean> {
  return repositories.businessFeature.isEnabled(businessId, feature);
}

/** Every feature currently enabled for `businessId`. */
export function listEnabledFeatures(businessId: string): Promise<Feature[]> {
  return repositories.businessFeature.listEnabledFeatures(businessId);
}

/** Convenience wrapper for the Ventas pipeline board. Now async (DB-backed). */
export function isPipelineEnabled(businessId: string): Promise<boolean> {
  return isFeatureEnabled(businessId, "pipeline");
}
