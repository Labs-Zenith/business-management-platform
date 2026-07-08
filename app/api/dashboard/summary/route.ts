import { NextResponse } from "next/server";
import { withApiHandler } from "@/lib/server/http";
import { requireSession } from "@/lib/session";
import { getDashboardSummary } from "@/lib/services/dashboard-service";

/**
 * `GET /api/dashboard/summary`, per
 * `openspec/changes/mocked-mvp-scaffold/specs/dashboard/spec.md` and
 * `docs/api-spec.md`'s Dashboard section. Returns all 5 KPIs in a single
 * payload, always scoped to `session.businessId` — see
 * `lib/services/dashboard-service.ts`'s `getDashboardSummary`.
 */

export const GET = withApiHandler(async (): Promise<NextResponse> => {
  const session = await requireSession();

  const summary = await getDashboardSummary(session);

  return NextResponse.json({ data: summary }, { status: 200 });
});
