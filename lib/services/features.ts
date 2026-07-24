/**
 * Per-BUSINESS feature flags (env-driven allowlist). Distinct from role
 * capabilities (`lib/services/permissions.ts`): a capability gates by the
 * member's ROLE within a business, whereas a feature here is enabled for a
 * set of BUSINESSES regardless of role.
 *
 * Currently just the "Ventas" (sales pipeline) board, enabled via the
 * comma-separated `PIPELINE_ENABLED_BUSINESS_IDS` env var (see .env.example).
 * The env is read at CALL time (not module load) so it can be varied per test
 * and picks up runtime config without a rebuild. Deny-by-default: an empty or
 * unset var disables the feature for everyone.
 */
function parseBusinessAllowlist(raw: string | undefined): Set<string> {
  return new Set(
    (raw ?? "")
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean),
  );
}

/** True if the Ventas (sales pipeline) board is enabled for `businessId`. */
export function isPipelineEnabled(businessId: string): boolean {
  return parseBusinessAllowlist(process.env.PIPELINE_ENABLED_BUSINESS_IDS).has(businessId);
}
