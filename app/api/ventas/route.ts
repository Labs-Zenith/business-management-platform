import { NextResponse } from "next/server";
import { ApiError } from "@/lib/server/api-error";
import { withApiHandler } from "@/lib/server/http";
import { checkOrigin } from "@/lib/server/origin-check";
import { pipelineCardCreateSchema } from "@/lib/schemas/pipeline";
import { requireSession } from "@/lib/session";
import { isPipelineEnabled } from "@/lib/services/features";
import { createPipelineCard, listPipelineCards } from "@/lib/services/pipeline-service";

/**
 * `GET`/`POST /api/ventas` — the sales pipeline (kanban) board. Mirrors
 * `app/api/products/route.ts`'s exact conventions (plain `requireSession()`,
 * no role/capability gate — any authenticated member of an ENABLED business
 * may use the board), EXCEPT this feature is additionally gated per-business
 * via `isPipelineEnabled` (see `lib/services/features.ts`): a session whose
 * business isn't in the `PIPELINE_ENABLED_BUSINESS_IDS` allowlist gets 403
 * FORBIDDEN, checked immediately after `requireSession()` and before any
 * repository access. `list` has no pagination (see `PipelineRepository`'s
 * doc comment in `lib/services/ports.ts`).
 */

export const GET = withApiHandler(async (_request: Request): Promise<NextResponse> => {
  const session = await requireSession();
  if (!isPipelineEnabled(session.businessId)) {
    throw new ApiError("FORBIDDEN", "The sales pipeline is not enabled for this business.");
  }

  const data = await listPipelineCards(session);

  return NextResponse.json({ data }, { status: 200 });
});

export const POST = withApiHandler(async (request: Request): Promise<NextResponse> => {
  // Defense in depth, matching `docs/security-plan.md`: session THEN feature
  // gate THEN origin THEN payload shape, before any repository call.
  const session = await requireSession();
  if (!isPipelineEnabled(session.businessId)) {
    throw new ApiError("FORBIDDEN", "The sales pipeline is not enabled for this business.");
  }
  checkOrigin(request);

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    throw new ApiError("VALIDATION_ERROR", "Invalid JSON payload.");
  }

  const parsed = pipelineCardCreateSchema.safeParse(json);
  if (!parsed.success) {
    throw new ApiError("VALIDATION_ERROR", "Invalid pipeline card payload.", parsed.error.flatten());
  }

  const card = await createPipelineCard(session, parsed.data);

  return NextResponse.json({ data: card }, { status: 201 });
});
