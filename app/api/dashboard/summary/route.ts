import { NextResponse } from "next/server";
import { withApiHandler } from "@/lib/server/http";
import { requireSession } from "@/lib/session";
import { getDashboardSummary } from "@/lib/services/dashboard-service";
import { parsePeriodParam } from "@/lib/services/dashboard-period";

/**
 * `GET /api/dashboard/summary`, per
 * `openspec/changes/mocked-mvp-scaffold/specs/dashboard/spec.md` and
 * `docs/api-spec.md`'s Dashboard section. Returns all 5 KPIs in a single
 * payload, always scoped to `session.businessId` — see
 * `lib/services/dashboard-service.ts`'s `getDashboardSummary`.
 *
 * Accepts an optional `?period=`. Omitting it resolves to the LAST 30 DAYS —
 * the window the dashboard screen shows. That is a deliberate change from the
 * previous default of "the current calendar month": a caller who needs a
 * calendar month must now ask for it (`?period=2026-07`), which is also what
 * the dashboard's export menu does.
 */

export const GET = withApiHandler(async (request: Request): Promise<NextResponse> => {
  const session = await requireSession();
  const { searchParams } = new URL(request.url);
  const period = parsePeriodParam(searchParams.get("period") ?? undefined);

  const summary = await getDashboardSummary(session, period);

  return NextResponse.json({ data: summary }, { status: 200 });
});
