import { NextResponse } from "next/server";
import { ApiError } from "@/lib/server/api-error";
import { withApiHandler } from "@/lib/server/http";
import { checkOrigin } from "@/lib/server/origin-check";
import { customerUpdateSchema } from "@/lib/schemas/customer";
import { requireCapability, requireSession } from "@/lib/session";
import { deleteCustomer, getCustomer, updateCustomer } from "@/lib/services/customer-service";

/**
 * `GET`/`PATCH`/`DELETE /api/customers/{id}`, per
 * `openspec/changes/mocked-mvp-scaffold/specs/customers/spec.md` and
 * `docs/api-spec.md`'s Customers section. Cross-business ids always resolve
 * to `NOT_FOUND` — existence is never revealed across businesses.
 *
 * `GET`/`PATCH` stay open to any authenticated member. `DELETE` does NOT: it
 * is gated on the admin-only `deleteRecords` capability, because destroying a
 * customer is irreversible in a way the `isActive` toggle is not. It also
 * refuses (`CONFLICT`) while any invoice or payment still references the
 * customer — see `deleteCustomer`. Response shape mirrors the codebase's
 * other delete, `app/api/ventas/[id]/route.ts`.
 */

type RouteContext = { params: Promise<{ id: string }> };

export const GET = withApiHandler(async (_request: Request, context: RouteContext): Promise<NextResponse> => {
  const session = await requireSession();
  const { id } = await context.params;

  const customer = await getCustomer(session, id);

  return NextResponse.json({ data: customer }, { status: 200 });
});

export const PATCH = withApiHandler(async (request: Request, context: RouteContext): Promise<NextResponse> => {
  const session = await requireSession();
  checkOrigin(request);
  const { id } = await context.params;

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    throw new ApiError("VALIDATION_ERROR", "Invalid JSON payload.");
  }

  const parsed = customerUpdateSchema.safeParse(json);
  if (!parsed.success) {
    throw new ApiError("VALIDATION_ERROR", "Invalid customer update payload.", parsed.error.flatten());
  }

  const customer = await updateCustomer(session, id, parsed.data);

  return NextResponse.json({ data: customer }, { status: 200 });
});

export const DELETE = withApiHandler(async (request: Request, context: RouteContext): Promise<NextResponse> => {
  // Defense in depth, matching `docs/security-plan.md`: capability THEN
  // origin THEN params, before any repository call.
  const session = await requireCapability("deleteRecords");
  checkOrigin(request);
  const { id } = await context.params;

  await deleteCustomer(session, id);

  return NextResponse.json({ data: { ok: true } }, { status: 200 });
});
