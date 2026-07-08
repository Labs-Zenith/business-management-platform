import { NextResponse } from "next/server";
import { ApiError } from "@/lib/server/api-error";
import { withApiHandler } from "@/lib/server/http";
import { checkOrigin } from "@/lib/server/origin-check";
import { customerUpdateSchema } from "@/lib/schemas/customer";
import { requireSession } from "@/lib/session";
import { getCustomer, updateCustomer } from "@/lib/services/customer-service";

/**
 * `GET`/`PATCH /api/customers/{id}`, per
 * `openspec/changes/mocked-mvp-scaffold/specs/customers/spec.md` and
 * `docs/api-spec.md`'s Customers section. Cross-business ids always resolve
 * to `NOT_FOUND` — existence is never revealed across businesses.
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
