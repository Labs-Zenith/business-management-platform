import { NextResponse } from "next/server";
import { parsePagination, withApiHandler } from "@/lib/server/http";
import { requireSession } from "@/lib/session";
import { listPayments } from "@/lib/services/payment-service";
import type { PaymentListQuery } from "@/lib/services/ports";

/**
 * `GET /api/payments`, per
 * `openspec/changes/mocked-mvp-scaffold/specs/payments/spec.md` and
 * `docs/api-spec.md`'s Payments section.
 */

export const GET = withApiHandler(async (request: Request): Promise<NextResponse> => {
  const session = await requireSession();

  const { searchParams } = new URL(request.url);
  const { page, pageSize } = parsePagination(searchParams);
  const query: PaymentListQuery = {
    page,
    pageSize,
    customerId: searchParams.get("customerId") ?? undefined,
    invoiceId: searchParams.get("invoiceId") ?? undefined,
    from: searchParams.get("from") ?? undefined,
    to: searchParams.get("to") ?? undefined,
  };

  const result = await listPayments(session, query);

  return NextResponse.json(
    { data: result.data, page: result.page, pageSize: result.pageSize, total: result.total },
    { status: 200 },
  );
});
