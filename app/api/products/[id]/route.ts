import { NextResponse } from "next/server";
import { ApiError } from "@/lib/server/api-error";
import { withApiHandler } from "@/lib/server/http";
import { checkOrigin } from "@/lib/server/origin-check";
import { productUpdateSchema } from "@/lib/schemas/product";
import { requireSession } from "@/lib/session";
import { updateProduct } from "@/lib/services/product-service";

/**
 * `PATCH /api/products/{id}`, per
 * `openspec/changes/inventario/specs/inventory-tracking/spec.md`'s "Products
 * Are Business-Scoped and Editable" requirement (name/sku/unitCost/
 * minStockThreshold/active are editable; there is no delete, only the active
 * toggle — so there is no `DELETE` handler here). Mirrors
 * `app/api/employees/[id]/route.ts`'s `PATCH`, EXCEPT there is no
 * `requireCapability` gate — per the spec's "No Role Gating on Inventory"
 * requirement, any authenticated session may update a product. Cross-business
 * ids resolve to `NOT_FOUND` via `updateProduct`, same as every other
 * repository in this codebase — existence is never revealed across
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
