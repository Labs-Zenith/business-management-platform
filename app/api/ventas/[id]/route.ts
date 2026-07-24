import { NextResponse } from "next/server";
import { ApiError } from "@/lib/server/api-error";
import { withApiHandler } from "@/lib/server/http";
import { checkOrigin } from "@/lib/server/origin-check";
import { pipelineCardUpdateSchema } from "@/lib/schemas/pipeline";
import { requireSession } from "@/lib/session";
import { isPipelineEnabled } from "@/lib/services/features";
import { deletePipelineCard, updatePipelineCard } from "@/lib/services/pipeline-service";

/**
 * `PATCH`/`DELETE /api/ventas/{id}` — mirrors `app/api/products/[id]/route.ts`'s
 * `PATCH` (plain `requireSession()`, no role gate) plus the same per-business
 * feature gate as `app/api/ventas/route.ts`. UNLIKE Product, cards ARE
 * deletable — `DELETE` mirrors `app/api/auth/remove-account/route.ts`'s
 * `{ data: { ok: true } }` response shape. Cross-business ids resolve to
 * `NOT_FOUND` via `updatePipelineCard`/`deletePipelineCard`, same as every
 * other repository in this codebase — existence is never revealed across
 * businesses.
 */

type RouteContext = { params: Promise<{ id: string }> };

export const PATCH = withApiHandler(async (request: Request, context: RouteContext): Promise<NextResponse> => {
  const session = await requireSession();
  if (!isPipelineEnabled(session.businessId)) {
    throw new ApiError("FORBIDDEN", "The sales pipeline is not enabled for this business.");
  }
  checkOrigin(request);
  const { id } = await context.params;

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    throw new ApiError("VALIDATION_ERROR", "Invalid JSON payload.");
  }

  const parsed = pipelineCardUpdateSchema.safeParse(json);
  if (!parsed.success) {
    throw new ApiError("VALIDATION_ERROR", "Invalid pipeline card update payload.", parsed.error.flatten());
  }

  const card = await updatePipelineCard(session, id, parsed.data);

  return NextResponse.json({ data: card }, { status: 200 });
});

export const DELETE = withApiHandler(async (request: Request, context: RouteContext): Promise<NextResponse> => {
  const session = await requireSession();
  if (!isPipelineEnabled(session.businessId)) {
    throw new ApiError("FORBIDDEN", "The sales pipeline is not enabled for this business.");
  }
  checkOrigin(request);
  const { id } = await context.params;

  await deletePipelineCard(session, id);

  return NextResponse.json({ data: { ok: true } }, { status: 200 });
});
