import { NextResponse } from "next/server";
import { withApiHandler } from "@/lib/server/http";
import { requireSession } from "@/lib/session";
import { getInvoice } from "@/lib/services/invoice-service";

/**
 * `GET /api/invoices/{id}`, per
 * `openspec/changes/mocked-mvp-scaffold/specs/invoices/spec.md` and
 * `docs/api-spec.md`'s Invoices section. Cross-business ids always resolve
 * to `NOT_FOUND` — existence is never revealed across businesses. The
 * response's `status` is always the value recomputed at read time by
 * `lib/mock/invoice-repo.ts` (via `lib/services/status.ts`), even if the
 * persisted `status` field is stale.
 */

type RouteContext = { params: Promise<{ id: string }> };

export const GET = withApiHandler(async (_request: Request, context: RouteContext): Promise<NextResponse> => {
  const session = await requireSession();
  const { id } = await context.params;

  const invoice = await getInvoice(session, id);

  return NextResponse.json({ data: invoice }, { status: 200 });
});
