import { NextResponse } from "next/server";
import { ApiError } from "@/lib/server/api-error";
import { withApiHandler } from "@/lib/server/http";
import { checkOrigin } from "@/lib/server/origin-check";
import { employeeUpdateSchema } from "@/lib/schemas/employee";
import { requireCapability } from "@/lib/session";
import { updateEmployee } from "@/lib/services/employee-service";

/**
 * `PATCH /api/employees/{id}`, per
 * `openspec/changes/nomina-payroll/specs/payroll-management/spec.md`'s
 * "Employees Are Business-Scoped and Editable" requirement (name/baseSalary/
 * active are editable; there is no delete, only the active toggle — so
 * there is no `DELETE` handler here). Mirrors
 * `app/api/customers/[id]/route.ts`'s `PATCH`, gated by `requireCapability`
 * instead of plain `requireSession()`. Cross-business ids resolve to
 * `NOT_FOUND` via `updateEmployee`, same as every other repository in this
 * codebase — existence is never revealed across businesses.
 */

type RouteContext = { params: Promise<{ id: string }> };

export const PATCH = withApiHandler(async (request: Request, context: RouteContext): Promise<NextResponse> => {
  const session = await requireCapability("viewPayroll");
  checkOrigin(request);
  const { id } = await context.params;

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    throw new ApiError("VALIDATION_ERROR", "Invalid JSON payload.");
  }

  const parsed = employeeUpdateSchema.safeParse(json);
  if (!parsed.success) {
    throw new ApiError("VALIDATION_ERROR", "Invalid employee update payload.", parsed.error.flatten());
  }

  const employee = await updateEmployee(session, id, parsed.data);

  return NextResponse.json({ data: employee }, { status: 200 });
});
