-- Up Migration
--
-- Per-business feature entitlements (generalizes the earlier
-- `PIPELINE_ENABLED_BUSINESS_IDS` env var into a DB-backed table — see
-- `lib/services/features.ts`): enabling a module for a business is now a row
-- in this table, no redeploy required. `feature` is free TEXT (not an ENUM)
-- so a new feature never needs a schema change, mirroring `audit_log`'s
-- `entity_type`/`action` columns (see `1700000009000_add_audit_log.sql`'s
-- equivalent rationale). Deny-by-default: no row (or `enabled = false`) means
-- the feature is off for that business, matching `isPipelineEnabled`'s prior
-- "empty allowlist = disabled for everyone" contract. Currently only
-- `"pipeline"` (the Ventas sales pipeline board) is ever written, via
-- `lib/services/ports.ts`'s `Feature` union type.
--
-- RLS enabled + membership SELECT policy, matching every other
-- business-scoped table (`pipeline_cards`, etc.) — defense-in-depth for the
-- PostgREST surface; the app's direct `postgres` connection bypasses RLS.
-- No INSERT/UPDATE/DELETE policy: entitlements are only ever written by
-- server-side scripts (`scripts/seed-demo.ts`) or trusted internal tooling
-- over the direct `postgres` connection, never by an end user via
-- PostgREST.
CREATE TABLE IF NOT EXISTS business_features (
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  feature TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT false, -- deny-by-default: a bare INSERT that omits this column leaves the feature OFF, matching isEnabled's contract
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (business_id, feature)
);

ALTER TABLE business_features ENABLE ROW LEVEL SECURITY;

CREATE POLICY business_features_member ON public.business_features FOR SELECT TO authenticated
  USING (business_id IN (SELECT business_id FROM public.profiles WHERE user_id = auth.uid()));

-- Down Migration
DROP TABLE IF EXISTS business_features CASCADE;
