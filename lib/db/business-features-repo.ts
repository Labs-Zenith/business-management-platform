import type { BusinessFeatureRepository, Feature } from "@/lib/services/ports";
import { sql } from "./client";

/**
 * Postgres-backed `business_features` entitlements (see
 * `migrations/1700000015000_add_business_features.sql`). Deny-by-default:
 * `isEnabled` returns `false` for both "no row" and an explicit
 * `enabled = false` row, matching the prior env-var allowlist's "empty =
 * disabled for everyone" contract (`lib/services/features.ts`).
 */

export const businessFeatureRepo: BusinessFeatureRepository = {
  async isEnabled(businessId: string, feature: Feature): Promise<boolean> {
    const rows = (await sql`
      SELECT enabled FROM business_features WHERE business_id = ${businessId} AND feature = ${feature}
    `) as unknown as { enabled: boolean }[];
    return rows[0]?.enabled ?? false;
  },

  async listEnabledFeatures(businessId: string): Promise<Feature[]> {
    const rows = (await sql`
      SELECT feature FROM business_features WHERE business_id = ${businessId} AND enabled = true
    `) as unknown as { feature: string }[];
    return rows.map((row) => row.feature as Feature);
  },

  async setEnabled(businessId: string, feature: Feature, enabled: boolean): Promise<void> {
    await sql`
      INSERT INTO business_features (business_id, feature, enabled)
      VALUES (${businessId}, ${feature}, ${enabled})
      ON CONFLICT (business_id, feature) DO UPDATE SET enabled = excluded.enabled, updated_at = now()
    `;
  },
};
