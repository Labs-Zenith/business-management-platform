import { NextResponse } from "next/server";
import { ApiError } from "@/lib/server/api-error";
import { withApiHandler } from "@/lib/server/http";
import { checkOrigin } from "@/lib/server/origin-check";
import { businessUpdateSchema } from "@/lib/schemas/business";
import { requireSession } from "@/lib/session";
import { updateBusinessProfile } from "@/lib/services/business-service";

/**
 * `PATCH /api/business`, per `openspec/specs/business-profile/spec.md` and
 * `docs/business-rules.md`'s "Negocios (Perfil y Cambio de Negocio)"
 * section. Mirrors `app/api/customers/[id]/route.ts`'s PATCH convention.
 * Not dynamic (no `[id]` segment) — the target business is always
 * `session.businessId`, never a client-supplied id, matching
 * `updateBusinessProfile`'s contract.
 */

export const PATCH = withApiHandler(async (request: Request): Promise<NextResponse> => {
  const session = await requireSession();
  checkOrigin(request);

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    throw new ApiError("VALIDATION_ERROR", "Invalid JSON payload.");
  }

  const parsed = businessUpdateSchema.safeParse(json);
  if (!parsed.success) {
    throw new ApiError("VALIDATION_ERROR", "Invalid business update payload.", parsed.error.flatten());
  }

  const business = await updateBusinessProfile(session, parsed.data);

  return NextResponse.json({ data: business }, { status: 200 });
});
