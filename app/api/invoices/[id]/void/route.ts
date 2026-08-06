import { NextResponse } from "next/server";
import { z } from "zod";
import { ApiError } from "@/lib/server/api-error";
import { withApiHandler } from "@/lib/server/http";
import { checkOrigin } from "@/lib/server/origin-check";
import { requireCapability } from "@/lib/session";
import { voidInvoice } from "@/lib/services/invoice-service";

/**
 * `POST /api/invoices/{id}/void` — logically deletes an invoice created by
 * mistake: its stock movements are reversed and its payments voided, so it
 * counts toward nothing, while the row, its number and its line items stay
 * for the record.
 *
 * Deliberately a `POST`, not a `DELETE`: nothing is removed. Compare
 * `app/api/products/[id]/route.ts`'s `DELETE`, which really does drop rows.
 *
 * Admin-only via `voidInvoice` — see `lib/services/permissions.ts` for why
 * this is its own capability rather than a reuse of `deleteRecords`.
 */

const voidSchema = z
  .object({
    // Mandatory: a month later nobody remembers why FAC-0012 was voided. The
    // service trims and re-checks, so an all-whitespace reason is rejected
    // there even if it satisfies `min(1)` here.
    reason: z.string().trim().min(1, "El motivo es obligatorio.").max(500),
  })
  .strict();

type RouteContext = { params: Promise<{ id: string }> };

export const POST = withApiHandler(async (request: Request, context: RouteContext): Promise<NextResponse> => {
  // Defense in depth, matching `docs/security-plan.md`: capability THEN
  // origin THEN params THEN payload shape, before any repository call.
  const session = await requireCapability("voidInvoice");
  checkOrigin(request);
  const { id } = await context.params;

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    throw new ApiError("VALIDATION_ERROR", "Invalid JSON payload.");
  }

  const parsed = voidSchema.safeParse(json);
  if (!parsed.success) {
    throw new ApiError("VALIDATION_ERROR", "Invalid void payload.", parsed.error.flatten());
  }

  const invoice = await voidInvoice(session, id, parsed.data.reason);

  return NextResponse.json({ data: invoice }, { status: 200 });
});
