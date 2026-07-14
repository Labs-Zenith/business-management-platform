/**
 * Business-profile service, per `openspec/specs/business-profile/spec.md`
 * and `docs/business-rules.md`'s "Negocios (Perfil y Cambio de Negocio)"
 * section. Business profile editing was previously deferred (see git
 * history) but is now supported via `updateBusinessProfile`.
 *
 * Every function resolves `businessId` from the `Session` argument ONLY —
 * never from client input — matching the "business_id Scoping
 * (RLS-Equivalent)" requirement. The callers are
 * `app/(dashboard)/settings/page.tsx` (read) and
 * `app/api/business/route.ts` (read + write).
 *
 * `updateBusinessProfile` additionally gates on the `editBusinessProfile`
 * capability (admin-only) — a security review found the mutation had NO
 * role gate, letting any member (including `worker`) edit the business
 * name/contact/currency. This is a plain `can(session.role, ...)` check
 * (mirroring `<MovementsPanel>`'s widget-level `viewAuditLog` gate) rather
 * than `requireCapability`, since this function already receives a
 * resolved `Session` and `requireCapability` re-resolves its own.
 */

import { ApiError } from "@/lib/server/api-error";
import { can } from "@/lib/services/permissions";
import { repositories } from "@/lib/services/repositories";
import type { Business, BusinessUpdate, Session } from "@/lib/services/ports";

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

/**
 * Updates the business record scoped to `session.businessId` — `businessId`
 * always comes from the session, never from `data` or any other client
 * input (matching `getBusinessProfile`'s scoping and
 * `updateCustomer`'s convention in `customer-service.ts`). Validation of
 * `data`'s shape happens upstream via `lib/schemas/business.ts`'s `.strict()`
 * schema; this function only forwards the already-validated fields.
 *
 * Authoritative role gate: throws `FORBIDDEN` if `session.role` lacks the
 * `editBusinessProfile` capability (admin-only) — this is the real control,
 * not the UI's read-only rendering for non-admins.
 */
export async function updateBusinessProfile(session: Session, data: BusinessUpdate): Promise<Business> {
  if (!can(session.role, "editBusinessProfile")) {
    throw new ApiError("FORBIDDEN", "You do not have access to this resource.");
  }

  const updated = await repositories.business.update(session.businessId, data);
  if (!updated) {
    // Defensive: a valid session's businessId should always resolve to a
    // seeded business record. Reported as NOT_FOUND (rather than an
    // unchecked throw) so callers get the standard ApiError shape.
    throw new ApiError("NOT_FOUND", "Business not found");
  }
  return updated;
}
