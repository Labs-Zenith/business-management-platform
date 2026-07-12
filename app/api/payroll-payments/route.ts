import { NextResponse } from "next/server";
import { ApiError } from "@/lib/server/api-error";
import { parsePagination, withApiHandler } from "@/lib/server/http";
import { checkOrigin } from "@/lib/server/origin-check";
import { payrollPaymentCreateSchema } from "@/lib/schemas/payroll-payment";
import { requireCapability } from "@/lib/session";
import { createPayrollPayment, listPayrollPayments } from "@/lib/services/payroll-service";
import type { PayrollPaymentListQuery } from "@/lib/services/ports";

/**
 * `GET`/`POST /api/payroll-payments`, per
 * `openspec/changes/nomina-payroll/specs/payroll-management/spec.md`'s
 * "Payroll Payments Are Business-Scoped and Append-Only" and "Atomic
 * Payment-to-Expense Linkage" requirements. There is no `PATCH`/`DELETE`
 * here — payroll payments are append-only (proposal's accepted MVP
 * constraint), so only list + create exist.
 *
 * Mirrors `app/api/expenses/route.ts`'s shape, gated by `requireCapability`
 * instead of plain `requireSession()` — the app's first role-gated API
 * surface. `POST` composes `createPayrollPayment`, which atomically inserts
 * the payment AND its linked `category:'nomina'` expense.
 */

export const GET = withApiHandler(async (request: Request): Promise<NextResponse> => {
  const session = await requireCapability("viewPayroll");

  const { searchParams } = new URL(request.url);
  const { page, pageSize } = parsePagination(searchParams);
  const query: PayrollPaymentListQuery = {
    page,
    pageSize,
    employeeId: searchParams.get("employeeId") ?? undefined,
    from: searchParams.get("from") ?? undefined,
    to: searchParams.get("to") ?? undefined,
  };

  const result = await listPayrollPayments(session, query);

  return NextResponse.json(
    { data: result.data, page: result.page, pageSize: result.pageSize, total: result.total },
    { status: 200 },
  );
});

export const POST = withApiHandler(async (request: Request): Promise<NextResponse> => {
  // Defense in depth, matching `docs/security-plan.md`: capability THEN
  // origin THEN payload shape, before any repository call.
  const session = await requireCapability("viewPayroll");
  checkOrigin(request);

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    throw new ApiError("VALIDATION_ERROR", "Invalid JSON payload.");
  }

  const parsed = payrollPaymentCreateSchema.safeParse(json);
  if (!parsed.success) {
    throw new ApiError("VALIDATION_ERROR", "Invalid payroll payment payload.", parsed.error.flatten());
  }

  const payment = await createPayrollPayment(session, parsed.data);

  return NextResponse.json({ data: payment }, { status: 201 });
});
