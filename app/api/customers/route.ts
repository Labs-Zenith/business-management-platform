import { NextResponse } from "next/server";
import { ApiError } from "@/lib/server/api-error";
import { parsePagination, withApiHandler } from "@/lib/server/http";
import { checkOrigin } from "@/lib/server/origin-check";
import { customerCreateSchema } from "@/lib/schemas/customer";
import { requireSession } from "@/lib/session";
import { createCustomer, listCustomers } from "@/lib/services/customer-service";
import type { CustomerListQuery } from "@/lib/services/ports";

/**
 * `GET`/`POST /api/customers`, per
 * `openspec/changes/mocked-mvp-scaffold/specs/customers/spec.md` and
 * `docs/api-spec.md`'s Customers section.
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
  const session = await requireSession();

  const { searchParams } = new URL(request.url);
  const { page, pageSize } = parsePagination(searchParams);
  const query: CustomerListQuery = {
    page,
    pageSize,
    q: searchParams.get("q") ?? undefined,
    status: parseStatus(searchParams.get("status")),
  };

  const result = await listCustomers(session, query);

  return NextResponse.json(
    { data: result.data, page: result.page, pageSize: result.pageSize, total: result.total },
    { status: 200 },
  );
});

export const POST = withApiHandler(async (request: Request): Promise<NextResponse> => {
  // Defense in depth, matching `docs/security-plan.md`: session THEN origin
  // THEN payload shape, before any repository call.
  const session = await requireSession();
  checkOrigin(request);

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    throw new ApiError("VALIDATION_ERROR", "Invalid JSON payload.");
  }

  const parsed = customerCreateSchema.safeParse(json);
  if (!parsed.success) {
    throw new ApiError("VALIDATION_ERROR", "Invalid customer payload.", parsed.error.flatten());
  }

  const customer = await createCustomer(session, parsed.data);

  return NextResponse.json({ data: customer }, { status: 201 });
});
