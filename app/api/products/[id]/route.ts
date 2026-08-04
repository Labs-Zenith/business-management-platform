import { NextResponse } from "next/server";
import { ApiError } from "@/lib/server/api-error";
import { withApiHandler } from "@/lib/server/http";
import { checkOrigin } from "@/lib/server/origin-check";
import { productUpdateSchema } from "@/lib/schemas/product";
import { requireCapability, requireSession } from "@/lib/session";
import { deleteProduct, updateProduct } from "@/lib/services/product-service";

/**
 * `PATCH`/`DELETE /api/products/{id}`, per
 * `openspec/changes/inventario/specs/inventory-tracking/spec.md`'s "Products
 * Are Business-Scoped and Editable" requirement (name/sku/unitCost/active are
 * editable).
 *
 * `PATCH` mirrors `app/api/employees/[id]/route.ts`'s, EXCEPT there is no
 * `requireCapability` gate — per the spec's "No Role Gating on Inventory"
 * requirement, any authenticated session may update a product.
 *
 * `DELETE` is the ONE exception to that rule: it IS gated, on the admin-only
 * `deleteRecords` capability, because destroying a product is irreversible in
 * a way the `active` toggle is not. It is also GUARDED — a product that
 * appears on any invoice is refused with a `CONFLICT` naming the invoice
 * count, so billing history is never destroyed by a catalog edit (see
 * `deleteProduct`); the UI turns that refusal into a "Desactivar" offer. The
 * response shape mirrors `app/api/ventas/[id]/route.ts`.
 *
 * Cross-business ids resolve to `NOT_FOUND` in both handlers, same as every
 * other repository in this codebase — existence is never revealed across
 * businesses.
 */

type RouteContext = { params: Promise<{ id: string }> };

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

  const parsed = productUpdateSchema.safeParse(json);
  if (!parsed.success) {
    throw new ApiError("VALIDATION_ERROR", "Invalid product update payload.", parsed.error.flatten());
  }

  const product = await updateProduct(session, id, parsed.data);

  return NextResponse.json({ data: product }, { status: 200 });
});

export const DELETE = withApiHandler(async (request: Request, context: RouteContext): Promise<NextResponse> => {
  // Defense in depth, matching `docs/security-plan.md`: capability THEN
  // origin THEN params, before any repository call.
  const session = await requireCapability("deleteRecords");
  checkOrigin(request);
  const { id } = await context.params;

  await deleteProduct(session, id);

  return NextResponse.json({ data: { ok: true } }, { status: 200 });
});
