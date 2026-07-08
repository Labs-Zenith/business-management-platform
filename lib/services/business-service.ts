/**
 * Business-profile service, per
 * `openspec/changes/mocked-mvp-scaffold/specs/business-profile/spec.md`.
 *
 * Read-only for this change: there is no update method here, in
 * `BusinessRepository` (`lib/services/ports.ts`), or anywhere else — editing
 * the business profile is explicitly deferred (proposal decision 1). The
 * only caller is `app/(dashboard)/settings/page.tsx`.
 */

import { ApiError } from "@/lib/server/api-error";
import { repositories } from "@/lib/services/repositories";
import type { Business, Session } from "@/lib/services/ports";

/**
 * Returns the business record scoped to `session.businessId` — the
 * mock-layer equivalent of the future RLS policy "`businesses` can only be
 * read or updated when its `id` matches the profile's `business_id`".
 * `businessId` always comes from the session, never from client input.
 */
export async function getBusinessProfile(session: Session): Promise<Business> {
  const business = await repositories.business.getById(session.businessId);
  if (!business) {
    // Defensive: a valid session's businessId should always resolve to a
    // seeded business record in this mock. Reported as NOT_FOUND (rather
    // than an unchecked throw) so callers get the standard ApiError shape.
    throw new ApiError("NOT_FOUND", "Business not found");
  }
  return business;
}
