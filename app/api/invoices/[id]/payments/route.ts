import { NextResponse } from "next/server";
import { ApiError } from "@/lib/server/api-error";
import { withApiHandler } from "@/lib/server/http";
import { checkOrigin } from "@/lib/server/origin-check";
import { paymentCreateSchema } from "@/lib/schemas/payment";
import { requireSession } from "@/lib/session";
import { createPayment } from "@/lib/services/payment-service";

/**
 * `POST /api/invoices/{id}/payments`, per
 * `openspec/changes/mocked-mvp-scaffold/specs/payments/spec.md` and
 * `docs/api-spec.md`'s Invoices section — this is the primary entry point
 * for registering a payment (the path itself enforces which invoice/lock
 * key is targeted, matching `design.md`'s "Key decisions": "Payment route =
 * POST /api/invoices/[id]/payments (path enforces ownership+lock key)").
 *
 * `paymentCreateSchema` (`.strict()`) already rejects any client-supplied
 * `customerId`/`business_id`/`status`/`balance` at the HTTP boundary;
 * `payment-service.ts` -> `lib/mock/payment-repo.ts` additionally never even
 * reads such fields, deriving `customerId` from the invoice and rejecting
 * any `amount` exceeding the current balance with NO partial mutation.
 */

type RouteContext = { params: Promise<{ id: string }> };

export const POST = withApiHandler(async (request: Request, context: RouteContext): Promise<NextResponse> => {
  // Defense in depth, matching `docs/security-plan.md`: session THEN origin
  // THEN payload shape, before any repository call.
  const session = await requireSession();
  checkOrigin(request);
  const { id } = await context.params;

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    throw new ApiError("VALIDATION_ERROR", "Invalid JSON payload.");
  }

  const parsed = paymentCreateSchema.safeParse(json);
  if (!parsed.success) {
    throw new ApiError("VALIDATION_ERROR", "Invalid payment payload.", parsed.error.flatten());
  }

  const invoice = await createPayment(session, id, parsed.data);

  return NextResponse.json({ data: invoice }, { status: 201 });
});
