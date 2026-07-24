import { NextResponse } from "next/server";
import { ApiError } from "@/lib/server/api-error";
import { withApiHandler } from "@/lib/server/http";
import { checkOrigin } from "@/lib/server/origin-check";
import { pipelineReorderSchema } from "@/lib/schemas/pipeline";
import { requireSession } from "@/lib/session";
import { isPipelineEnabled } from "@/lib/services/features";
import { reorderPipelineCards } from "@/lib/services/pipeline-service";

/**
 * `POST /api/ventas/reorder` — bulk, atomic position persistence for a drag
 * on the Ventas kanban board (Fix 1, the BLOCKER from the adversarial review
 * of commit a809337: a single-card `PATCH /api/ventas/{id}` only ever
 * persisted the MOVED card's own `{stage, position}`, silently dropping every
 * sibling's client-recomputed position — a reload then showed duplicate
 * positions within a stage). The board's `handleDragEnd` now sends the FULL
 * renumbered `0..n-1` position set for every card in each affected stage
 * here instead of PATCHing the single moved card.
 *
 * Mirrors `app/api/ventas/route.ts`'s exact conventions: plain
 * `requireSession()` (no role/capability gate) PLUS the same per-business
 * `isPipelineEnabled` feature gate, checked immediately after the session and
 * before `checkOrigin`/payload parsing/any repository access.
 */

export const POST = withApiHandler(async (request: Request): Promise<NextResponse> => {
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

  const parsed = pipelineReorderSchema.safeParse(json);
  if (!parsed.success) {
    throw new ApiError("VALIDATION_ERROR", "Invalid pipeline reorder payload.", parsed.error.flatten());
  }

  await reorderPipelineCards(session, parsed.data.items);

  return NextResponse.json({ data: { ok: true } }, { status: 200 });
});
