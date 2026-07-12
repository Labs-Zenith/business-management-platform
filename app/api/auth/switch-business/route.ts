import { NextResponse } from "next/server";
import { z } from "zod";
import { ApiError } from "@/lib/server/api-error";
import { checkOrigin } from "@/lib/server/origin-check";
import { loadStoreFromCookie, saveStoreToCookie } from "@/lib/mock/cookie-persistence";
import { requireSession } from "@/lib/session";
import { repositories } from "@/lib/services/repositories";

/**
 * `.strict()` rejects any unknown field, per `docs/security-plan.md`'s
 * "rechazo de campos desconocidos sensibles" rule — in particular, a
 * client-supplied `role` here would be a privilege-escalation vector; `role`
 * is ALWAYS derived server-side from the target membership row, never from
 * the request body.
 */
const switchBusinessSchema = z.object({ businessId: z.string().min(1) }).strict();

function errorResponse(error: ApiError): NextResponse {
  return NextResponse.json(error.toResponseBody(), {
    status: error.status,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function POST(request: Request): Promise<NextResponse> {
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return errorResponse(new ApiError("VALIDATION_ERROR", "Invalid JSON payload."));
  }

  const parsed = switchBusinessSchema.safeParse(json);
  if (!parsed.success) {
    return errorResponse(
      new ApiError("VALIDATION_ERROR", "Invalid request payload.", parsed.error.flatten())
    );
  }

  await loadStoreFromCookie();
  try {
    // Defense in depth: only an already-authenticated request may switch its
    // active business. `middleware.ts` does not guard `/api/auth/*` (same
    // precedent as login/logout), so this route enforces the session
    // requirement itself.
    const { userId } = await requireSession();
    checkOrigin(request);

    // THE authorization check for this endpoint: `listMembershipsForUser`
    // reads the currently-active, backend-aware `BusinessRepository` (real
    // Postgres when configured, mock otherwise) — never the unsigned
    // `app_data` mock-store cookie. `match.role` below is the ONLY source of
    // truth passed to `switchBusiness`; it is never taken from the request
    // body.
    const memberships = await repositories.business.listMembershipsForUser(userId);
    const match = memberships.find((membership) => membership.businessId === parsed.data.businessId);
    if (!match) {
      const response = errorResponse(
        new ApiError("FORBIDDEN", "You are not a member of this business.")
      );
      saveStoreToCookie(response);
      return response;
    }

    // `switchBusiness` performs NO membership verification of its own — it
    // blindly trusts `match.role`, which was just verified above against the
    // backend-aware `BusinessRepository`. This is intentionally the ONLY
    // membership gate for this endpoint (see the `AuthPort.switchBusiness`
    // security contract in `lib/services/ports.ts`).
    const session = await repositories.auth.switchBusiness(parsed.data.businessId, match.role);
    if (!session) {
      // `switchBusiness` can still return `null` if there is no current
      // session cookie at all (e.g. it was cleared between `requireSession()`
      // succeeding and this call) — this is no longer a membership-rejection
      // path, since membership was already verified above.
      const response = errorResponse(
        new ApiError("UNAUTHENTICATED", "No active session to switch.")
      );
      saveStoreToCookie(response);
      return response;
    }

    const response = NextResponse.json(
      { data: { session } },
      { status: 200, headers: { "Cache-Control": "no-store" } }
    );
    saveStoreToCookie(response);
    return response;
  } catch (error) {
    if (!(error instanceof ApiError)) {
      console.error("[switch-business] unexpected error", error);
    }
    const response = error instanceof ApiError
      ? errorResponse(error)
      : errorResponse(new ApiError("INTERNAL_ERROR", "Unexpected error."));
    saveStoreToCookie(response);
    return response;
  }
}
