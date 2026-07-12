import { NextResponse } from "next/server";
import { ApiError } from "@/lib/server/api-error";
import { parsePagination, withApiHandler } from "@/lib/server/http";
import { checkOrigin } from "@/lib/server/origin-check";
import { employeeCreateSchema } from "@/lib/schemas/employee";
import { requireCapability } from "@/lib/session";
import { createEmployee, listEmployees } from "@/lib/services/employee-service";
import type { EmployeeListQuery } from "@/lib/services/ports";

/**
 * `GET`/`POST /api/employees`, per
 * `openspec/changes/nomina-payroll/specs/payroll-management/spec.md`'s
 * "Employees Are Business-Scoped and Editable" requirement and
 * `design.md`'s Routes & page structure section. Mirrors
 * `app/api/customers/route.ts` exactly, EXCEPT the first auth step: every
 * payroll route calls `requireCapability("viewPayroll")` instead of plain
 * `requireSession()` — the app's first role-gated API surface. A `worker`
 * session is denied `403 FORBIDDEN` before any repository call.
 */

function parseStatus(raw: string | null): "active" | "inactive" | undefined {
  if (raw === null) {
    return undefined;
  }
  if (raw === "active" || raw === "inactive") {
    return raw;
  }
  throw new ApiError("VALIDATION_ERROR", 'Invalid "status" query parameter.', { status: raw });
}

export const GET = withApiHandler(async (request: Request): Promise<NextResponse> => {
  const session = await requireCapability("viewPayroll");

  const { searchParams } = new URL(request.url);
  const { page, pageSize } = parsePagination(searchParams);
  const query: EmployeeListQuery = {
    page,
    pageSize,
    q: searchParams.get("q") ?? undefined,
    status: parseStatus(searchParams.get("status")),
  };

  const result = await listEmployees(session, query);

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

  const parsed = employeeCreateSchema.safeParse(json);
  if (!parsed.success) {
    throw new ApiError("VALIDATION_ERROR", "Invalid employee payload.", parsed.error.flatten());
  }

  const employee = await createEmployee(session, parsed.data);

  return NextResponse.json({ data: employee }, { status: 201 });
});
