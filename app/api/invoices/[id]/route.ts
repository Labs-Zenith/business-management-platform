import { NextResponse } from "next/server";
import { ApiError } from "@/lib/server/api-error";
import { withApiHandler } from "@/lib/server/http";
import { checkOrigin } from "@/lib/server/origin-check";
import { invoiceUpdateSchema } from "@/lib/schemas/invoice";
import { requireSession } from "@/lib/session";
import { getInvoice, updateInvoice } from "@/lib/services/invoice-service";

/**
 * `GET`/`PATCH /api/invoices/{id}`, per
 * `openspec/changes/mocked-mvp-scaffold/specs/invoices/spec.md`,
 * `openspec/changes/audit-log/specs/invoices/spec.md`, and
 * `docs/api-spec.md`'s Invoices section. Cross-business ids always resolve
 * to `NOT_FOUND` — existence is never revealed across businesses. The
 * response's `status` is always the value recomputed at read time by
 * `lib/mock/invoice-repo.ts` (via `lib/services/status.ts`), even if the
 * persisted `status` field is stale.
 *
 * `PATCH` mirrors `app/api/products/[id]/route.ts`'s convention exactly:
 * `requireSession()` only, NO capability gate — invoice editing itself is
 * not role-restricted (only VIEWING the audit trail, via `viewAuditLog`, is
 * admin-only). Rejects a payment-locked invoice with `CONFLICT` (409) via
 * `updateInvoice`'s edit-lock check, never a 500.
 */

type RouteContext = { params: Promise<{ id: string }> };

export const GET = withApiHandler(async (_request: Request, context: RouteContext): Promise<NextResponse> => {
  const session = await requireSession();
  const { id } = await context.params;

  const invoice = await getInvoice(session, id);

  return NextResponse.json({ data: invoice }, { status: 200 });
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

  const parsed = invoiceUpdateSchema.safeParse(json);
  if (!parsed.success) {
    throw new ApiError("VALIDATION_ERROR", "Invalid invoice update payload.", parsed.error.flatten());
  }

  const invoice = await updateInvoice(session, id, parsed.data);

  return NextResponse.json({ data: invoice }, { status: 200 });
});
